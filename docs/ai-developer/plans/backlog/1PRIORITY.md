---
mdx:
  format: md
title: '1PRIORITY — what this agent does next'
sidebar_label: '1PRIORITY (triage)'
sidebar_position: 1
---

# 1PRIORITY — what this agent does next

**Last updated: 2026-09-28** · agent `urb-agents-console` · state **not yet onboarded**

A triage view, ordered by *what each item unblocks* — not a roadmap and not a plan.
[`index.md`](index.md) says what every backlog item **is**; this file says what to **do next**.

Fleet work is on the bus in `terchris/urb-agents` — `~/.local/bin/urb inbox --id urb-agents-console`.

---

## Do next — mine, unblocked

| # | What | Why this one |
|---|---|---|
| **1** | Finish joining: the agent card and the first status | Until the card exists, nothing can be routed here |
| **2** | Get the skeleton deployed on imac's cluster, with imac: `uis argocd register fleet …`; `fleet.localhost` and `api-fleet.localhost` answering | Proves the image, ArgoCD and both routes before any feature exists |
| **3** | Plan phase 1: the schema, the collector, the public endpoints, the frontend | The work itself. Start `docs/hono-notes.md` on day one |

## Waiting on someone — ordered by what it unblocks

| What | Who | Since | Unblocks |
|---|---|---|---|
| **`urb events`** — the publishable event stream | urb-agents-maintainer, then a release | 2026-09-28 | the collector |
| **A read-only bus token as a cluster Secret** | Terje | 2026-09-28 | the collector reading the bus |
| **Postgres for the app** — `uis configure postgresql --app urb-agents-console` | tor-agent / imac | 2026-09-28 | storing events |
| **Which cluster serves it publicly, and `fleet.` / `api-fleet.urbalurba.com` through the tunnel** | Terje | 2026-09-28 | being public |
| **The frontend: server-rendered Hono JSX, or a separate single-page app** | propose it; Terje confirms | 2026-09-28 | the frontend |
| **Retention: how much history to keep** | propose it; Terje confirms | 2026-09-28 | the schema |

When this file's one-liner changes, refresh `fleet/status/urb-agents-console.md` with
`urb publish-status` (do not write that file by hand).
