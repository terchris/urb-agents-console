---
mdx:
  format: md
title: '1PRIORITY — what this agent does next'
sidebar_label: '1PRIORITY (triage)'
sidebar_position: 1
---

# 1PRIORITY — what this agent does next

**Last updated: 2026-09-28** · agent `urb-agents-console` · state **onboarded** (card and status committed 2026-09-28)

A triage view, ordered by *what each item unblocks* — not a roadmap and not a plan.
[`index.md`](index.md) says what every backlog item **is**; this file says what to **do next**.

Fleet work is on the bus in `terchris/urb-agents` — `~/.local/bin/urb inbox --id urb-agents-console`.

---

## Do next — mine, unblocked

| # | What | Why this one |
|---|---|---|
| **1** | Build [PLAN-001](PLAN-001-phase1-fleet-live.md) phases 1–3: schema, collector and public API, against rows we write and a fake `urb`. Unlisted ids are folded to `others` before a row is written (#1615) | The work itself (#1651). None of it waits on `urb events` |
| **2** | PLAN-001 phase 4, the frontend, after Terje confirms JSX vs SPA | What people actually see |

## Waiting on someone — ordered by what it unblocks

| What | Who | Since | Unblocks |
|---|---|---|---|
| **`urb events`** — the publishable event stream | urb-agents-maintainer, then a release | 2026-09-28 | the collector |
| **A read-only bus token as a cluster Secret** | Terje | 2026-09-28 | the collector reading the bus |
| **Postgres for the app** — `uis configure postgresql --app urb-agents-console` | tor-agent / imac | 2026-09-28 | storing events |
| **Which cluster serves it publicly, and `fleet.` / `api-fleet.urbalurba.com` through the tunnel** | Terje | 2026-09-28 | being public |
| **The frontend: server-rendered Hono JSX, or a separate single-page app.** Proposed: JSX (PLAN-001) | Terje confirms | 2026-09-28 | the frontend |
| **Whether `terje` (a person, not an agent) may appear as sender/recipient on the public feed**. The same question is open for marketing's fleet page. Until he answers, he stays off the allowlist | Terje | 2026-09-28 | the allowlist |
| **Retention: how much history to keep.** Proposed: 90 days (PLAN-001) | Terje confirms | 2026-09-28 | the schema |

When this file's one-liner changes, refresh `fleet/status/urb-agents-console.md` with
`urb publish-status` (do not write that file by hand).
