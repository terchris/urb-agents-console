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
| **1** | [PLAN-004](../active/PLAN-004-console-insights.md): summary, inventory, active now, histogram, keys (ideas 1–5 from other consoles). **Live 2026-09-28** | Terje asked for it; no change to `urb` needed |
| **2** | [PLAN-003](../active/PLAN-003-rhythm-view.md): the rhythm view and `/v1/activity`. **Live 2026-09-28** | Defined for phase 1 in the fleet's investigation (activity per hour) |
| **3** | Two contract questions left on #1651: is a truncated window signalled, and which variable carries the token in a container | Only these can still change the collector |

## Waiting on someone — ordered by what it unblocks

| What | Who | Since | Unblocks |
|---|---|---|---|
| **How a pod runs `urb` and follows `fleet/cli-version`**: one fleet pattern for `fleet-collector` and `huginn`, which is also unsolved. Terje agreed the binary comes in at pod start, not in the public image (#1662) | urb-agents-maintainer | 2026-09-28 | the collector reading the bus |
| **Purpose and structure on the bus** (a `purpose:` vocabulary, routine `context_id`, and `urb events` carrying keyed task/context/refs hashes). Proposed as Terje's wish, **for evaluation, not build** (#1673). It decides how far the page can show *how agents cooperate* | urb-agents-maintainer evaluates, then Terje decides | 2026-09-28 | views 2 and 3 of the page |
| **A read-only bus token and `URB_EVENTS_KEY` (a stable secret, ≥16 chars, never rotated) as the Secret `urb-agents-console-bus`** | Terje | 2026-09-28 | the collector reading the bus |
| **Postgres for the app**: `uis configure postgresql --app urb-agents-console --init-file - --namespace fleet --secret-name-prefix urb-agents-console`, which writes the Secret `urb-agents-console-db` (#1676) | imac (tor-agent has no access to imac) | 2026-09-28 | storing events |
| **Working with marketing** (#1687): marketing can embed the network, show live data from `/v1/` and deep-link here; asked in return for avatars at a stable URL, a public `agents.json` (role, page, avatar), and one shared list of who may be named | marketing | 2026-09-28 | avatars and agent pages in the console; live data on marketing's site |
| **Decide on #1677's recommendations** (tor-agent, evaluated; UIS 1.6.163): `uis configure` stays the seam for the database; the app *names* the Secrets it expects and the platform refuses, naming any that are missing (item 4); given secrets stay out of git (Sealed Secrets and SOPS break Principle 0, the laptop, rather than secrecy) | Terje | 2026-09-28 | how the bus token and `URB_EVENTS_KEY` reach the cluster |
| **Keep a copy of `URB_EVENTS_KEY` outside the cluster** before the collector relies on it. It must never change, UIS has no backups, and one `kubectl delete namespace` would lose it for good (tor-agent, #1677) | Terje (the key's creator) | 2026-09-28 | a key that survives the cluster |

When this file's one-liner changes, refresh `fleet/status/urb-agents-console.md` with
`urb publish-status` (do not write that file by hand).
