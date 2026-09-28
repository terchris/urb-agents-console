# Hono notes

What building this console taught us about [Hono](https://hono.dev/) on Bun, the good and the bad.
Terje is trialling Hono before a bigger project, and this record is half the point of the
repository. Newest entries go at the bottom of each section, and each one gives the date and what prompted it.

## Decisions, and the alternatives we did not take

- **2026-09-28: the public API is written in Hono, not PostgREST.** Atlas serves its API as
  PostgREST over `api_v1` views, which UIS provides per app. For a feed this small that would have
  been less code. We chose Hono because trialling it is the point. There is also a real
  difference: in Hono, "only the contract's fields go public" is enforced by code and a test, not
  by how a view and its grants are written. If the next project is mostly "expose tables", weigh
  PostgREST first.

## Bun (the runtime under Hono)

- **2026-09-28: `Bun.sql` is a Postgres client with no dependency.** `import { SQL } from "bun"`.
  Tagged templates are parameterised, `sql(rows)` expands an array of objects into a multi-row
  `INSERT`, `sql.begin(tx => …)` gives a transaction, and a `sql\`\`` fragment composes into
  another query, which is how the optional `WHERE` is built. Timestamps come back as `Date`.
  `sql.unsafe(text)` runs a multi-statement file, which is how the tests apply
  `config/init-database.sql`.
- **2026-09-28: `tsc` is not bundled.** `bun run typecheck` needs `typescript` in devDependencies
  and a `bun install` first. `bun test` runs the TypeScript without type-checking it.

## Hono

*(Entries start with phase 3, the API.)*
