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
| **1** | [PLAN-002](../active/PLAN-002-network-view.md): the live network (who talks to whom), its embed and `/v1/network` | Terje: *"the most important here is to visualise … who talks to who"*. Buildable with today's feed ([INVESTIGATE-fleet-visualisation](INVESTIGATE-fleet-visualisation.md)) |
| **2** | View 4, rhythm: activity per hour and `/v1/activity` | Defined for phase 1 in the fleet's investigation; buildable today |
| **3** | Two contract questions left on #1651: is a truncated window signalled, and which variable carries the token in a container | Only these can still change the collector |

## Waiting on someone — ordered by what it unblocks

| What | Who | Since | Unblocks |
|---|---|---|---|
| **How a pod runs `urb` and follows `fleet/cli-version`**: one fleet pattern for `fleet-collector` and `huginn`, which is also unsolved. Terje agreed the binary comes in at pod start, not in the public image (#1662) | urb-agents-maintainer | 2026-09-28 | the collector reading the bus |
| **Purpose and structure on the bus** (a `purpose:` vocabulary, routine `context_id`, and `urb events` carrying keyed task/context/refs hashes). Proposed as Terje's wish, **for evaluation, not build** (#1673). It decides how far the page can show *how agents cooperate* | urb-agents-maintainer evaluates, then Terje decides | 2026-09-28 | views 2 and 3 of the page |
| **A read-only bus token and `URB_EVENTS_KEY` (a stable secret, ≥16 chars, never rotated) as the Secret `urb-agents-console-bus`** | Terje | 2026-09-28 | the collector reading the bus |
| **Postgres for the app** — `uis configure postgresql --app urb-agents-console --init-file config/init-database.sql`, with the URL as Secret `urb-agents-console-db` | tor-agent / imac | 2026-09-28 | storing events |

When this file's one-liner changes, refresh `fleet/status/urb-agents-console.md` with
`urb publish-status` (do not write that file by hand).
