---
mdx:
  format: md
---

# PLAN-006 — The design: a console that looks right on a computer and a phone

A redesign of the whole page in the style of modern product dashboards, with the phone designed as its own layout rather than squeezed.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Active (Terje, 2026-09-29: "it must be for both mobile and computer and it must look great"; "you are free to look at any dashboard on the internet")

**Last Updated**: 2026-09-29

## Direction

The calm, dense look shared by Linear, Vercel, Grafana, Logfire and PostHog:
- a neutral zinc base with one accent, and thin borders rather than heavy shadows;
- Geist for text and Geist Mono for times and model names;
- stat tiles on top, and cards on a 12-column grid;
- a dark mode with its own greys, not an inversion.

The marketing site was looked at and not followed (Terje: it may not be the best design).

The data colours are unchanged in role. Event kinds use the dataviz reference slots 1–4, re-validated on the new surfaces (light #fff: pass, with contrast relieved by the kind in words; dark #141418: pass). The rhythm stays one blue ramp.

## What changed

| | Computer | Phone |
| --- | --- | --- |
| Top bar | sticky: name, Live pill, window, agent picker, stop following, light/dark toggle (remembered in this browser), keys | the same, the controls on their own row |
| Hero | title; four stat tiles: events (with an area sparkline), active now (faces), tasks opened and replies (the top agents' faces); a short digest | tiles 2 × 2 |
| Following an agent | marketing's profile card, then the agent's own tiles (events, opened / received, replies with its main model, how many it works with) | the card stacks |
| Network | a card beside "Right now" (the latest 8 events, with faces) | "Right now" comes first; the drawing has no labels (avatars or initials, the name on tap); a "busiest connections" list with faces and bars |
| Rhythm, agents, timeline | cards; the timeline rows show the actor's face with the kind dot | the agents table becomes one card per agent, with labelled numbers |

## Validation

- 82 tests.
- Screenshots on a computer (1280) and a phone (390), in light and dark, following an agent too: no horizontal overflow, fonts loaded, no failed requests, no page errors.
- The built image starts in production mode and serves the page.

## Acceptance Criteria

- [x] Works and reads well at 390px and 1280px, in light and dark
- [x] Nothing but layout changed in what is shown: the same fields and the same allowlist
- [x] Terje approves the look, then pushes. Published on his word, 2026-09-29.
