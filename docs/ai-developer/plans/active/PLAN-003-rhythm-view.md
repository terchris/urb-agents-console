---
mdx:
  format: md
---

# PLAN-003 — The rhythm view: when the fleet works and rests

A heat strip of agents by time, with the whole fleet as bars above it, and `/v1/activity`: the "activity per hour" the fleet's investigation lists for phase 1.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Active (Terje, 2026-09-28: "start on the rhythm view while we wait")

**Goal**: a reader sees when the fleet is busy, who works when, and who is quiet.

**Last Updated**: 2026-09-28

**Investigation**: [`INVESTIGATE-fleet-visualisation.md`](../backlog/INVESTIGATE-fleet-visualisation.md), view 4

## Decisions

| | |
| --- | --- |
| Buckets | The size follows the window: 24h → 1 hour (24 columns), 7d → 6 hours (28), 30d → 1 day (30). Edges sit on Oslo's clock (whole hours, 00/06/12/18, midnights). Sizes are fixed, so across a daylight-saving change a day bucket runs an hour off midnight; that is accepted. |
| What counts | An agent's cell counts the events it took part in, as sender, recipient or replier, and each event once per agent. The fleet's bars count all events. |
| Encoding | Sequential, one hue: the dataviz reference blue ramp, light → dark, with the anchor flipped in dark mode. Five steps on a √ scale, so a quiet hour next to a busy one still shows; zero is its own neutral cell. Rows are busiest first. |
| Idle agents | No row; they are named in a "quiet all window" line, so who idles is visible. |
| HTML, not SVG | CSS grid cells reflow at phone width, unlike a fixed drawing. |

## Tasks

- [x] 1 `src/time.ts`: the display zone, its offset, and `bucketsFor(window, now)`, tested in summer and winter
- [x] 2 `store.activity({ origin, size, count })` in both stores, one behaviour suite (the Postgres half computes bucket indexes in SQL, so only counts travel)
- [x] 3 `GET /v1/activity?window=` in OpenAPI 3.1 (validated)
- [x] 4 `src/rhythm-view.tsx`: the fleet's bars, a row per agent, axis ticks, a legend, the quiet line, tooltips on every cell and bar, and a table twin. Following an agent highlights its row.
- [x] 5 The page: between the network and the agent cards, scoped by the same window and agent filter

## Validation

Screenshots at 24h (light), 7d with an agent selected (dark) and 30d at phone width: no horizontal overflow and no page errors. The built image starts and serves the view.

## Acceptance Criteria

- [x] Only allowlisted ids and `others`; counts only, nothing beyond the contract
- [x] Every value in a cell is also in the table view
- [ ] Terje reviews it before it is pushed (pushing is publishing)
