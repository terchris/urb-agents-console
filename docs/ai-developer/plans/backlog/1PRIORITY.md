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
| **1** | [PLAN-001](../active/PLAN-001-phase1-fleet-live.md) phase 4: the frontend in Hono JSX, reading `/v1/events` | Phases 1–3 are done (schema, collector, OpenAPI 3.1 API), so the page is what's left that waits on nobody. Terje reads it before it's public |
| **2** | Answers from urb-agents-maintainer on #1651 (the five questions), then fit the collector to the real `urb events` | Only the answers can change the collector |

## Waiting on someone — ordered by what it unblocks

| What | Who | Since | Unblocks |
|---|---|---|---|
| **`urb events`** — the publishable event stream | urb-agents-maintainer, then a release | 2026-09-28 | the collector |
| **How the collector gets `urb`**: `terchris/urb-agents` is private, so its release binary cannot go into this public image. Proposed: an initContainer that downloads it with the bus token (PLAN-001 2.5) | Terje | 2026-09-28 | the collector reading the bus |
| **A read-only bus token as a cluster Secret** | Terje | 2026-09-28 | the collector reading the bus |
| **Postgres for the app** — `uis configure postgresql --app urb-agents-console --init-file config/init-database.sql`, with the URL as Secret `urb-agents-console-db` | tor-agent / imac | 2026-09-28 | storing events |
| **Which cluster serves it publicly, and `fleet.` / `api-fleet.urbalurba.com` through the tunnel** | Terje | 2026-09-28 | being public |
| **Whether `terje` (a person, not an agent) may appear as sender/recipient on the public feed**. The same question is open for marketing's fleet page. Until he answers, he stays off the allowlist | Terje | 2026-09-28 | the allowlist |

When this file's one-liner changes, refresh `fleet/status/urb-agents-console.md` with
`urb publish-status` (do not write that file by hand).
