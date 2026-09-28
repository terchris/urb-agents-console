---
mdx:
  format: md
---

# PLAN-001 — Phase 1: the fleet, live and public

Collect the bus's events into Postgres with one collector, and serve them publicly as a JSON feed on api-fleet and a page on fleet.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Backlog

**Goal**: `fleet.<domain>` shows what the fleet is doing within about a minute of it happening, and
`api-fleet.<domain>/v1/events` serves the same thing as public JSON, with nothing on either that
`urb events` does not emit and no id that is not on the allowlist.

**Last Updated**: 2026-09-28

**Task**: terchris/urb-agents #1651 (the goal and the `urb events` contract) · allowlist: #1615

**Prerequisites**: the skeleton on imac's cluster, done in #1611 (`fleet.localhost` and
`api-fleet.localhost` answer, and `events: []` passes).

## Problem Summary

The skeleton serves an empty feed. Phase 1 needs four things: a schema for the `urb events` row,
a collector that fills it, public endpoints that read it, and a frontend. None of these needs
`urb events` to exist yet, because the row shape is fixed (#1651). Until it is released, tests use
rows we write ourselves and a fake `urb`.

## Decisions in this plan

These are mine. Where Terje has to confirm, it says so.

| | |
| --- | --- |
| Database client | **`Bun.sql`**, Bun's built-in Postgres client, so there is no driver dependency. It goes into `docs/hono-notes.md` as a Bun finding, not a Hono one. |
| Migrations | Plain numbered SQL files in `migrations/`, applied at startup by the collector only, under a Postgres advisory lock. The web app never runs DDL. |
| The allowlist | `src/allowlist.ts`, a checked-in `Set`, visible in the public repo. **An id that isn't listed is rewritten to `others` before the row is written**, so the id never reaches Postgres. This is marketing's fold (`tools/bus-stats.ts`): activity stays countable, but it is not attributable. `rc-eval`, `urbalurba` and `terje` are not listed. |
| Only publishable fields | The collector parses each row against an explicit field list, and **fields it does not know are dropped rather than stored**. If `urb events` ever adds a field, the field goes nowhere until this code names it (contract 3). |
| Frontend | **Proposed: server-rendered Hono JSX** (`hono/jsx`), plus a small inline script that polls `/v1/events` every 30 s. One image, no build step, and it exercises the part of Hono Terje wants to trial. *Terje confirms.* |
| Retention | **Proposed: 90 days.** The collector deletes older rows once a day. *Terje confirms.* |
| Real time | Polling, not SSE or WebSockets. The collector's one-minute cadence sets the latency, so push adds complexity without making anything fresher. |

## Schema

```sql
create table events (
  id         text primary key,          -- the contract's opaque hash: de-duplication only
  at         timestamptz not null,
  kind       text not null check (kind in ('opened','moved','replied','closed')),
  from_id    text not null,             -- an allowlisted id, or 'others'
  to_id      text not null,             -- an allowlisted id, or 'others'
  state      text,
  provider   text,                      -- null: a label move, or written before urb 0.5.43
  model      text,
  collected  timestamptz not null default now()
);
create index events_at on events (at desc);

create table collector_mark (
  name  text primary key,               -- 'events'
  since timestamptz not null,
  ran   timestamptz not null
);
```

## Phase 1: Schema and store

### Tasks

- [ ] 1.1 `migrations/001-events.sql` (above), and a migrator that applies it under `pg_advisory_lock`
- [ ] 1.2 `src/store.ts`: `insertEvents(rows)` (`on conflict (id) do nothing`), `readEvents({before, limit})`, `getMark` / `setMark`, `prune(olderThan)`
- [ ] 1.3 `src/event.ts`: `parseEvent(unknown) → Event | null`, which applies the field list, the allowlist fold, the `kind` check and the ISO `at` check
- [ ] 1.4 Tests: `parseEvent` against good, bad and extra-field rows, with no database needed; the store against a throwaway local Postgres (`docker run postgres`), skipped when `DATABASE_URL` is unset
- [ ] 1.5 Start `docs/hono-notes.md`

### Validation

`bun test` and `bun run typecheck` pass. A row with an unlisted `from`, and a row with an extra field, are both covered by tests.

---

## Phase 2: The collector

### Tasks

- [ ] 2.1 `src/collector.ts`: every 60 s, run `urb events --since <mark − 10 min> --json`, parse, insert, and move the mark to the newest `at`, in one transaction. The 10-minute overlap catches events GitHub reports late; the primary key makes the overlap free. On the first run the mark is `24h`.
- [ ] 2.2 Failure: if `urb` exits non-zero or its output doesn't parse, log it, keep the mark, and try again on the next tick. The collector never exits over a bad run.
- [ ] 2.3 Daily prune (retention)
- [ ] 2.4 A fake `urb` (a script that prints fixture rows) for tests and local runs, selected with `URB_BIN`
- [ ] 2.5 Image: add the Linux `urb` build of the release that `fleet/cli-version` routes, checked against `SHA256SUMS` at build time (contract 2)
- [ ] 2.6 `manifests/collector.yaml`: Deployment `fleet-collector`, `replicas: 1`, `strategy: Recreate`, command `bun run src/collector.ts`, pod label `app: fleet-collector` so `fleet-service` never selects it, and no Service. The bus token and `DATABASE_URL` come from Secrets, referenced by name only.

### Validation

Locally, against the fake `urb` and a local Postgres: rows arrive, re-runs add no duplicates, a failing `urb` leaves the mark where it was, and an unlisted id is stored as `others`.

---

## Phase 3: The public API (`api-fleet.<domain>/v1/`)

### Tasks

- [ ] 3.1 `GET /v1/events?before=<iso>&limit=<n>`: newest first, `limit` defaults to 100 with a maximum of 500, and fields exactly as in the contract (`from_id` and `to_id` are served as `from` and `to`). Response: `{ schema: "urb-events/1", events, next }`, where `next` is the cursor for older events.
- [ ] 3.2 `GET /v1/agents`: per id (allowlisted, plus `others`) over the last 24 h, the count of each kind and when it was last seen. Derived from `events` only.
- [ ] 3.3 `Cache-Control: public, max-age=30` on both. Invalid query parameters return 400 with a short message, never a stack trace.
- [ ] 3.4 Tests with `app.request()`, including a check that no response ever contains a key outside the contract.
- [ ] 3.5 Tell `marketing`, the first consumer, on the bus when the shape is live.

### Validation

`curl api-fleet.localhost/v1/events` returns the collected rows, and `curl -H 'Origin: https://example.com'` gets CORS `*` (GET only).

---

## Phase 4: The frontend (`fleet.<domain>/`)

### Tasks

- [ ] 4.1 Hono JSX page: the latest events as a timeline, one line each (time · from → to · kind · state · model), and an agent strip from `/v1/agents`
- [ ] 4.2 An inline script that polls every 30 s and prepends new rows. The page still works without JavaScript.
- [ ] 4.3 Light and dark, readable at phone width
- [ ] 4.4 **Terje reads the page before it goes public (contract 5).**

### Validation

Terje looks at `fleet.localhost` on imac's cluster and approves it.

---

## Phase 5: Live on imac's cluster

Blocked on others; see 1PRIORITY.md.

### Tasks

- [ ] 5.1 Postgres from `uis configure postgresql --app urb-agents-console` (tor-agent / imac). Report where UIS falls short.
- [ ] 5.2 The read-only bus token as a cluster Secret (Terje)
- [ ] 5.3 Switch from the fake `urb` to `urb events` once urb-agents-maintainer releases it
- [ ] 5.4 Public hostnames through the tunnel (Terje decides the cluster and the domain)

### Validation

Events appear on `fleet.<domain>` within about two minutes of a bus action, and #1651 is closed.

## Acceptance Criteria

- [ ] No field is stored or served beyond the contract, and never the subscription, a title, a body or a task number
- [ ] No id is stored unless it is on the allowlist; everything else is `others`
- [ ] Only the collector runs `urb`; a public request never reads the bus
- [ ] The collector runs as exactly one replica and survives a failing `urb`
- [ ] `docs/hono-notes.md` records what Hono (and Bun) were like, good and bad
- [ ] No secret in the repository

## Questions for urb-agents-maintainer (about `urb events`)

1. `--json`: one JSON array, or one object per line?
2. Does `--since` take a full ISO timestamp, like `2026-09-28T07:22:47Z`?
3. The reads are bounded. If a window holds more than the bound, is that signalled? If it isn't, the mark would skip events silently.
4. Can `to` be null, for example on a `closed` event?
5. In a container that isn't a fleet host: which environment variable carries the token, and does `urb events` need anything else, such as a roster or a config file?
