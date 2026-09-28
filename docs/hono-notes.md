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
- **2026-09-28: `Bun.spawn` does not see `process.env` changes made at runtime.** A child started
  after `process.env.X = "1"` did not get `X`, so a test expecting a failing child got a succeeding one. Pass
  `env: { ...process.env }` explicitly. It also has a `timeout` option, which kills the child;
  `proc.signalCode` then says so.

## Hono

- **2026-09-28: `@hono/zod-openapi` gives OpenAPI 3.1 from the code, and it works well.**
  `createRoute({ request: { query }, responses })` plus `app.openapi(route, handler)`: the same
  Zod schema validates the request, types `c.req.valid("query")`, and becomes the spec.
  `app.doc31("/openapi.json", …)` serves **3.1** (use `doc`, not `doc31`, for 3.0), with
  `nullable()` rendered as `type: ["string","null"]`. The output passed an independent 3.1
  validator first time.
- **2026-09-28: the default 400 is Zod's whole issue tree.** For a public API that's too much.
  `new OpenAPIHono({ defaultHook })` replaces it for every route with one short sentence.
- **2026-09-28: `.strict()` on a Zod object gives `additionalProperties: false` in the spec.**
  It describes the response; it does not filter it. What's served is still whatever the handler
  returns, so "no key outside the contract" is enforced by the store building `Event` field by
  field, and by a test.
- **2026-09-28: `app.request(path)` makes testing painless.** A Hono app is a `fetch` function,
  so tests call it directly: no server, no port, no supertest. With the store behind an interface
  (`MemoryStore` in tests), the API tests need no database.
- **2026-09-28: `app.route("/v1", api)` mounts a sub-app, and the spec's paths stay relative.**
  So `servers: [{ url: "/v1" }]` belongs in the `doc31` config.
- **2026-09-28: CORS is one line** (`hono/cors`), applied to the sub-app with `api.use("*", …)`.
  It covers `/v1/openapi.json` too, so a browser-based API viewer on another origin can read the spec.
