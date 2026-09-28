---
mdx:
  format: md
---

# INVESTIGATE — visualising the bus: who talks to whom, and how the agents cooperate

How the public console should show what happens on the bus (who talks to whom, what the work is for, and how agents cooperate to get it done), and what the event feed must carry for each view.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Backlog. Direction agreed with Terje 2026-09-28; view 1 is being built (PLAN-002)

**Last Updated**: 2026-09-28

## The question

Terje, 2026-09-28: *"the most important here is to visualise what is happening on the bus. who
talks to who and how the agents cooperate to get work done."* The first page (PLAN-001, phase 4)
was an agent strip and a timeline. It showed activity, but not structure, and Terje expected more.

The fleet's own design (`INVESTIGATE-urb-agents-console.md` in terchris/urb-agents, merged in #1608)
also lists these for phase 1, and PLAN-001 missed them: **activity per hour**, **time to first
reply**, and **a live section the marketing site can embed or link to**.

## What the feed can and cannot show

`urb events` (cli-v0.5.48, `urb-events/1`) gives one row per event: `at`, `kind`, the task's
`from` and `to`, `by` (who wrote a reply), `state`, and `provider`/`model` where recorded. The `id`
is a keyed hash of that *event*.

| Question | Today's feed | Needs |
| --- | --- | --- |
| Who talks to whom, and how much | ✅ every event carries its task's `from` → `to` | — |
| Who answers whom | ✅ `by` on replies | — |
| When the fleet works and rests | ✅ `at` per event | — |
| What a task is **for** (release, bug, deploy, question…) | ❌ no purpose exists on the bus | a `purpose` vocabulary (#1673) |
| One task's journey (opened → done), how long it took, time to first reply | ❌ events can't be tied to their task | a keyed **task** hash (#1673) |
| How agents cooperate: which task led to which, grouped by effort | ❌ `context_id` and `refs` exist on the bus but are not emitted | keyed **context** and **refs** hashes (#1673) |

**#1673** asks urb-agents-maintainer to *evaluate* adding these. It is a proposal, not a request to
build: they weigh the consequences first (load on senders, enforcement, what structure becomes
public), and then Terje decides.

## The views

### 1. Who talks to whom: a live network. Buildable today (PLAN-002)

- **Form:** a directed network. Agents sit at **fixed positions on a circle**, so nothing jumps as
  data arrives and a reader learns where each agent is. Rejected: a force-directed layout, which
  reshuffles on every change, and a chord diagram, which is harder to read for direction.
- **Encoding:**
  - an arrow from the task's sender to its recipient;
  - line width for how much traffic the pair's tasks had in the window (square-root scaled);
  - node size for each agent's involvement;
  - one hue for all links. Colour by agent was rejected: fifteen agents is far past the eight-hue
    ceiling, and colour would carry no meaning the position does not already carry.
- **Emphasis on selection:** choosing an agent colours its links in the accent and grays the rest.
  The timeline below then shows only that agent's events.
- **Live:** when the refresh brings new events, the links they belong to pulse briefly.
- **Accessible:** nodes are links, so a keyboard can select them and it works without JavaScript.
  Every link has a hover/focus tooltip, and a **table view** lists every pair with its counts.
- **Embeddable:** `/embed/network` is the same SVG on a bare page, for marketing to iframe.
- **API:** `GET /v1/network?window=24h|7d|30d` in OpenAPI 3.1, the same data the SVG is drawn from.

### 2. How work flows. Needs the task hash (#1673)

One lane per task, from opened to closed, coloured by state, with a tick for each reply. It shows
stuck work (`input-required`, a long `working`) and time to first reply. With `purpose`, lanes can be
grouped or coloured by what the work is for.

### 3. How agents cooperate. Needs context and refs (#1673)

Tasks grouped by initiative (`context_id`), with `refs` drawn as "this task led to that one".
For example: *cli-v0.5.48: 1 release → 6 deploys → 6 done, in 2 hours*, with each agent's part.
This is the most direct answer to Terje's question, and it depends most on the bus.

### 4. Rhythm: activity per hour. Buildable today

A heat strip of agents by hour, one hue, light to dark, over 24 hours or 7 days. It shows who is
busy when, and who idles while others work. `GET /v1/activity` serves "activity per hour" for the
investigation's phase 1.

## Design rules (from the dataviz method)

- **Form before colour.** Structure is shown with position and width; hue is used only where it
  carries a job.
- **Event kinds** use the validated reference categorical slots 1–4 in fixed order: opened (blue),
  moved (orange), replied (aqua), closed (yellow). They were checked with the palette validator on this
  page's own surfaces: light passes, with a contrast warning that is relieved because every kind is
  also written in words; dark passes.
- **Text never wears a data colour.** States and names are in ink; a coloured mark beside them
  carries the identity.
- **Sequential magnitude** (the rhythm heat strip) uses one hue, light to dark, and never a rainbow.
- **Every chart has a table twin.** Tooltips add detail, but never gate a value.
- **One filter row above everything it scopes:** the time window, and the selected agent.

## Recommendation and order

1. **View 1, the network, with its embed and `/v1/network`** (PLAN-002). It answers "who talks
   to whom" with today's feed.
2. **View 4, rhythm, and `/v1/activity`**: activity per hour.
3. **Views 2 and 3** once #1673 is evaluated and Terje has decided what the feed may carry.

## Open

- **#1673:** purpose, task, context and refs. The maintainer evaluates, then Terje decides.
- **Time to first reply** without a task hash: store what `urb stats --json` publishes as an
  aggregate, or wait for #1673?
- **Public home:** the console is already public on imac's cluster through its wildcard tunnel.
  Terje confirms whether that is where it should live.
