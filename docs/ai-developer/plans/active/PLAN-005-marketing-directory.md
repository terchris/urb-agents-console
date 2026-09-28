---
mdx:
  format: md
---

# PLAN-005 — Marketing's agent list: one naming list, and the agents' faces

The console reads marketing's public `agents.json` (#1687): its `named` list decides who may be shown, and its avatars, roles and pages give each agent a face and a link.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - `WORKFLOW.md` - The implementation process
> - `PLANS.md` - Plan structure and best practices

## Status: Active (Terje, 2026-09-29: "yes use marketing's named list, and build the avatars")

**Last Updated**: 2026-09-29

## Decisions

| | |
| --- | --- |
| One list | **Marketing's `named` is the authority** for who may be named. It comes from `website/src/lib/named.ts` in terchris/marketing, the same file her pages use. `src/allowlist.ts` keeps only a *snapshot*: the web app uses it before it has read the list, and the tests fold with it. The collector never folds with it. Adding an id is still Terje's decision. |
| Fail safe | The collector re-reads the list every hour and saves the last good one in Postgres (`naming`). If marketing's site cannot be reached it uses the saved list, and with no list at all it **does not collect**. It never falls back to naming everyone. |
| Removals apply backwards | When an id leaves the list, `store.setNamed` folds it to `others` in every row already stored (`from`, `to`, `by`), in the same transaction that saves the list. |
| Faces, not copies | Avatars load from `https://marketing.urbalurba.com/avatars/<id>.svg`; nothing is copied into this repo. Roles and page links come from `agents.json`. Every field is validated: ids shaped like bus ids, the role as short plain text, URLs https on marketing's host, or dropped. |
| When it is read | The web app reads `agents.json` at start and every 10 minutes, in the background, never on a visitor's request. |

## What changed

- `src/directory.ts`: `parseDirectory`, `fetchDirectory`, and `DirectoryCache` for the web app
- `src/allowlist.ts`: `SNAPSHOT`, and `named()` / `setNamed()`
- `src/collector.ts`: `refreshNaming` (marketing, then the saved list, then none) runs before collecting; `collectOnce` takes the list
- `config/init-database.sql`: the `naming` table (idempotent)
- The page:
  - the network draws each agent's avatar in its node (at least radius 11, arrows stop at its edge; idle agents greyed), with the role in the tooltip;
  - the inventory shows avatar, role and a ↗ link to marketing's page;
  - when following an agent: its avatar, its role, and "About <id>";
  - the embed shows the avatars too.

## Validation

- 79 tests: the directory is validated (wrong schema, unnamed profiles, foreign hosts, markup in the role); `setNamed` folds stored ids in both stores; `refreshNaming` falls back in order; the page with profiles loaded.
- Run against marketing's live `agents.json`: 9 avatars load in the table, with no failed requests, no page errors, and no overflow at 390px.

## Acceptance Criteria

- [x] The collector names nobody without a list from marketing, now or saved
- [x] An id removed from marketing's list disappears from what is stored
- [x] Nothing of marketing's is copied into this repo
- [ ] Terje reviews it before it is pushed (pushing is publishing)
- [ ] Tell marketing on the bus the day the collector runs (#1687)
