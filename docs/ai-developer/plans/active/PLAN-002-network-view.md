---
mdx:
  format: md
---

# PLAN-002 — The network view: who talks to whom, live

A live network of the agents on the page, drawn as SVG by Hono JSX on the server, with an OpenAPI endpoint, a table twin and an embeddable version.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Active (Terje, 2026-09-28: "write the investigate and start on the network view")

**Goal**: a reader of `fleet.<domain>` sees at a glance who sends work to whom, how much, and what
is happening right now. They can select an agent to follow its part.

**Last Updated**: 2026-09-28

**Investigation**: [`INVESTIGATE-fleet-visualisation.md`](../backlog/INVESTIGATE-fleet-visualisation.md), view 1

**Prerequisites**: PLAN-001 phases 1–4, built (the page is not yet pushed; see PLAN-001 4.4).

## Phase 1: Data

### Tasks

- [x] 1.1 `store.network(since)`: per ordered pair (`from` → `to`), the events, tasks opened and replies; per agent, its involvement. Both stores, one behaviour suite.
- [x] 1.2 `store.readEvents` takes an optional `agent` (as `from`, `to` or `by`), for the filtered timeline
- [x] 1.3 `GET /v1/network?window=24h|7d|30d` and `GET /v1/events?agent=`, both in the OpenAPI 3.1 spec, with tests

### Validation

`bun test` passes, and the spec passes the 3.1 validator.

## Phase 2: The view

### Tasks

- [x] 2.1 `src/network.ts`: pure layout functions (fixed circular positions in allowlist order, with `others` last; curved directed links, where A→B and B→A bend to opposite sides; square-root widths), unit-tested
- [x] 2.2 `src/network-view.tsx`: the SVG in JSX. Nodes are links (`?agent=`), with a label outside the circle. Each link has a `<title>` and `data-pair` for the live pulse.
- [x] 2.3 Emphasis on selection: the chosen agent's links in the accent, the rest grayed
- [x] 2.4 The filter row above: the window (24 h / 7 d / 30 d) and the selected agent with a clear link. It scopes the network, the agent strip, the count and the timeline.
- [x] 2.5 The table twin (`<details>`): every pair with its counts
- [x] 2.6 Hover and focus tooltips (text set with `textContent`), and the live pulse on links that get new events
- [x] 2.7 Kind colours switched to the validated reference slots 1–4; state text in ink

### Validation

Screenshots in light and dark, and at phone width. The live pulse is checked in a real Chrome (done 2026-09-28: tooltip text right; after a refresh, 13 connections pulsed for 21 new events; no page errors).

**Known limit:** at phone width the network is small (labels about 9–10px). The table twin and the "sends most to" sentence carry the same information there. A phone-specific layout is a possible follow-up.

## Phase 3: Embed

### Tasks

- [x] 3.1 `/embed/network?window=`: the SVG on a bare page, transparent-friendly, for an iframe
- [x] 3.2 A note in `docs/` for marketing: the iframe snippet and `/v1/network`

### Validation

The embed renders in an iframe on another origin (done: a `file://` host page framing `localhost:3099/embed/network`). The snippet is in [`docs/embed.md`](../../../embed.md).

## Acceptance Criteria

- [ ] Only allowlisted ids and `others` appear; nothing beyond the contract's fields
- [ ] Works without JavaScript: selection and window are plain links
- [ ] Every value in the network is also in the table view
- [ ] Terje reviews it before it is pushed (pushing is publishing)
