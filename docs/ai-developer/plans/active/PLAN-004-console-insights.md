---
mdx:
  format: md
---

# PLAN-004 — Insights from other consoles: summary, inventory, active now, histogram, keys

Ideas 1–5 from Terje's review of Pydantic Logfire, Pydantic AI and Conductor, built on today's feed with no change to `urb`.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Active (Terje, 2026-09-28: "start on ideas 1-5")

**Goal**: the page says what is happening in one sentence, shows every agent at a glance, and is quick to move around.

**Last Updated**: 2026-09-28

## What was built

| # | Idea | From | Where |
|---|---|---|---|
| 1 | **Agent inventory**: a sortable table replaces the cards (events, opened, received, replies, the models it wrote with, last seen, and a sparkline of its activity over the window) | Logfire's Agents view | `Inventory` in `src/insight-view.tsx`; `models` added to `store.agents` and `/v1/agents` |
| 2 | **Active now**: an event in the last 10 minutes marks an agent active, with a green dot in the table and a pulsing ring on the network node (and in the embed) | Conductor's "see at a glance" | `activeNow()` |
| 3 | **Histogram above the timeline**: events per bucket over the window, the buckets being shown marked, each bar a link to that time. It follows the selected agent. | Logfire's Live view | `Histogram` |
| 4 | **Summary sentence from counts**: the whole fleet (events, agents, who opened, received and replied most, the busiest connection, who is active), or the followed agent. No text from the bus; no sentence starts with an agent id. | Logfire's run summary, without the AI | `summary()` |
| 5 | **Keys**: `/` picks an agent, `Esc` stops following, `[` `]` change the window, `j` `k` step through events, `?` lists the keys. A "Keys" button opens the same list. The agent picker is a plain GET form, so it works without JavaScript. | Logfire's keyboard | `AgentPicker`, the page script |

Smaller things done along the way:
- the table's sort choice and open `<details>` survive the 30-second refresh;
- the refresh pauses while the reader is stepping through events;
- "No events before this time." on an empty older page.

## Validation

- 69 tests, including the summary wording, the inventory, active now, the histogram links, and the picker's empty "everyone".
- Driven in a real Chrome: the sort toggles `aria-sort`; `/` focuses the picker; `j j` lands on the second event; `?` opens the dialog; `]` goes to 7d; the picker follows imac; `Esc` stops following; a histogram bar jumps to that hour, with the shown range marked.
- No page errors. No horizontal overflow at 390px: on a phone the table drops the sparkline, models and received columns, lets names wrap, and has its own scroll box as a fallback.

## Acceptance Criteria

- [x] Nothing beyond the contract's fields; only allowlisted ids and `others`
- [x] Every value is reachable without hover (table cells, the summary, the histogram's labels)
- [ ] Terje reviews it before it is pushed (pushing is publishing)
