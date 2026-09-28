---
mdx:
  format: md
---

# PLAN-001 — Phase 1: the fleet, live and public

Collect the bus's events into Postgres with one collector, and serve them publicly as a JSON feed on api-fleet and a page on fleet.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Active (phases 1–3 approved by Terje, 2026-09-28)

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
| Schema | **`config/init-database.sql`, applied by UIS**: `uis configure postgresql --app urb-agents-console --init-file`. Every statement is idempotent (`create … if not exists`), so re-running it is safe. This follows dev-templates' `python-basic-webserver-database`. Neither the collector nor the web app runs DDL, which keeps "UIS provisions, ArgoCD deploys". |
| Database connection | One Secret, **`urb-agents-console-db`**, with key `DATABASE_URL`, holding the `cluster.database_url` that `uis configure postgresql --json` returns. Both Deployments read it through `secretKeyRef`; the dev-templates convention is `<app>-db`. |
| The public API | **Hono, not PostgREST** (Terje, 2026-09-28). Atlas serves its API as PostgREST over `api_v1` views, which UIS provides for each app. That would be less code, but trialling Hono is the point of this repository, and in Hono the contract's field list is enforced in code and tests rather than in grants. The alternative goes into `docs/hono-notes.md`. |
| The allowlist | `src/allowlist.ts`, a checked-in `Set`, visible in the public repo. **An id that isn't listed is rewritten to `others` before the row is written**, so the id never reaches Postgres. This is marketing's fold (`tools/bus-stats.ts`): activity stays countable, but it is not attributable. `rc-eval`, `urbalurba` and `terje` are not listed. |
| Only publishable fields | The collector parses each row against an explicit field list, and **fields it does not know are dropped rather than stored**. If `urb events` ever adds a field, the field goes nowhere until this code names it (contract 3). |
| Frontend | **Server-rendered Hono JSX** (`hono/jsx`), plus a small inline script that polls `/v1/events` every 30 s. One image, no build step, and it exercises the part of Hono Terje wants to trial. *Confirmed by Terje, 2026-09-28.* |
| Retention | **90 days.** The collector deletes older rows once a day. *Confirmed by Terje, 2026-09-28.* |
| API description | **OpenAPI 3.1** (Terje, 2026-09-28), served at `/v1/openapi.json`. The routes are written with `@hono/zod-openapi`: one Zod schema per request and response validates the query and *is* the spec (`doc31`). A test checks that `Event` is exactly the contract with `additionalProperties: false`, and the output passes an independent 3.1 validator. |
| Real time | Polling, not SSE or WebSockets. The collector's one-minute cadence sets the latency, so push adds complexity without making anything fresher. |

## Schema

[`config/init-database.sql`](../../../../config/init-database.sql) holds one `events` table in the contract's shape. `id` is `COLLATE "C"`, so paging ties break the same way in Postgres and in JavaScript, and `to_id` is nullable until question 4 is answered. There is also a one-row `collector_mark`.

## Phase 1: Schema and store

### Tasks

- [x] 1.1 `config/init-database.sql` (above), idempotent, for UIS to apply. For local tests, the same file is applied with `psql -f` to a throwaway Postgres.
- [x] 1.2 `src/store.ts`: `insertEvents(rows)` (`on conflict (id) do nothing`), `readEvents({before, limit})`, `getMark` / `setMark`, `prune(olderThan)`
- [x] 1.3 `src/event.ts`: `parseEvent(unknown) → Event | null`, which applies the field list, the allowlist fold, the `kind` check and the ISO `at` check
- [x] 1.4 Tests: `parseEvent` against good, bad and extra-field rows, with no database needed. One set of store behaviours runs against both `MemoryStore` and `PgStore`; the Postgres half needs `TEST_DATABASE_URL` and runs in CI against a `postgres:16` service. CI now tests before it builds.
- [x] 1.5 Start `docs/hono-notes.md`

### Validation

`bun test` and `bun run typecheck` pass. A row with an unlisted `from`, and a row with an extra field, are both covered by tests.

---

## Phase 2: The collector

### Tasks

- [x] 2.1 `src/collector.ts`: every 60 s, run `urb events --since <mark − 10 min> --json`, parse, insert, and move the mark to the newest `at`, in one transaction. The 10-minute overlap catches events GitHub reports late; the primary key makes the overlap free. On the first run the mark is `24h`.
- [x] 2.2 Failure: if `urb` exits non-zero or its output doesn't parse, log it, keep the mark, and try again on the next tick. The collector never exits over a bad run.
- [x] 2.3 Daily prune (retention)
- [x] 2.4 A fake `urb` (a script that prints fixture rows) for tests and local runs, selected with `URB_BIN`
- [ ] 2.5 **Waiting on urb-agents-maintainer (#1662).** The collector needs the Linux `urb` of the release `fleet/cli-version` routes, checked against `SHA256SUMS` (contract 2). `terchris/urb-agents` is private, so the binary cannot go into this public image. Terje agreed (2026-09-28) that it comes in at pod start. How a pod then *follows* routing is unsolved fleet-wide: `huginn` has the same gap. #1662 proposes a candidate (an initContainer fetches and verifies; the collector exits when `fleet/cli-version` changes, and the restart fetches the new release) and asks for one fleet pattern. Nothing is built here until there is an answer.
- [x] 2.6 `manifests/collector.yaml`: Deployment `fleet-collector`, `replicas: 1`, `strategy: Recreate`, command `bun run src/collector.ts`, pod label `app: fleet-collector` so `fleet-service` never selects it, and no Service. It is **not in `kustomization.yaml` yet**: every push deploys to imac, and it cannot start there until its Secrets and `urb` exist. `DATABASE_URL` comes from the Secret `urb-agents-console-db`, and the bus token from its own Secret. Both are referenced by name only.

### Validation

Locally, against the fake `urb` and a local Postgres: rows arrive, re-runs add no duplicates, a failing `urb` leaves the mark where it was, and an unlisted id is stored as `others`.

---

## Phase 3: The public API (`api-fleet.<domain>/v1/`)

### Tasks

- [x] 3.1 `GET /v1/events?before=<iso>&limit=<n>`: newest first, `limit` defaults to 100 with a maximum of 500, and fields exactly as in the contract (`from_id` and `to_id` are served as `from` and `to`). Response: `{ schema: "urb-events/1", events, next }`. `next` is `<time>~<id>` for the next, older page, and `before` also takes a plain ISO time.
- [x] 3.2 `GET /v1/agents`: per id (allowlisted, plus `others`) over the last 24 h, the count of each kind and when it was last seen. Derived from `events` only.
- [x] 3.3 `Cache-Control: public, max-age=30` on both. Invalid query parameters return 400 with a short message, never a stack trace.
- [x] 3.4 Tests with `app.request()`, including a check that no response ever contains a key outside the contract.
- [x] 3.4b `GET /v1/openapi.json`: OpenAPI 3.1, validated by `@seriousme/openapi-schema-validator` (a one-off run, not a CI dependency)
- [ ] 3.5 (phase 5, once it is live) Tell `marketing`, the first consumer, on the bus when the shape is live.

### Validation

`curl api-fleet.localhost/v1/events` returns the collected rows, and `curl -H 'Origin: https://example.com'` gets CORS `*` (GET only).

---

## Phase 4: The frontend (`fleet.<domain>/`)

### Tasks

- [x] 4.1 Hono JSX page: the latest events as a timeline, one line each (time · from → to · kind · state · model), and an agent strip from `/v1/agents`
- [x] 4.2 An inline script that polls every 30 s and prepends new rows. The page still works without JavaScript.
- [x] 4.3 Light and dark, readable at phone width
- [ ] 4.4 **Terje reads the page before it goes public (contract 5).** ⚠️ Pushing IS going public: imac's cluster already serves `fleet.urbalurba.com` and `api-fleet.urbalurba.com` through its wildcard tunnel (found 2026-09-28), so a push to `main` is live within minutes. Phase 4 stays unpushed until Terje has looked.
- [x] 4.5 `tools/seed.ts`: a few days of synthetic traffic in a local database, so the page can be seen before `urb events` exists

### Validation

Terje looks at `fleet.localhost` on imac's cluster and approves it.

---

## Phase 5: Live on imac's cluster

Blocked on others; see 1PRIORITY.md.

### Tasks

- [ ] 5.1 Postgres from `uis configure postgresql --app urb-agents-console --init-file config/init-database.sql` (tor-agent / imac), and its `cluster.database_url` stored as the Secret `urb-agents-console-db`. That is UIS's documented gap: say where it bites, and report where UIS falls short.
- [ ] 5.1b `fleet-web` gets the same `DATABASE_URL` from the same Secret
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
