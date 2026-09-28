// The public API, api-fleet.<domain>/v1/: public, credential-free and read-only, described as
// OpenAPI 3.1 at /v1/openapi.json.
//
// The routes are defined with @hono/zod-openapi: one Zod schema per request and response, which
// validates the query (a bad one is a 400) and is also the published spec, so the two cannot
// drift apart. The event schema is the urb events contract (#1651) field for field, and it is
// strict: nothing else can be described or served.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { OTHERS } from "./allowlist";
import { KINDS, type Event } from "./event";
import type { Cursor, Store } from "./store";

export const SCHEMA = "urb-events/1";
const CACHE = "public, max-age=30";

const Agent = z.string().openapi({
  description: `A bus id on the console's allowlist, or \`${OTHERS}\` for every id that is not`,
  example: "ops-dev",
});

const EventSchema = z
  .object({
    id: z.string().openapi({ description: "Opaque and stable. For de-duplication only; it identifies no task." }),
    at: z.string().datetime().openapi({ example: "2026-09-28T07:22:47.000Z" }),
    kind: z.enum(KINDS),
    from: Agent,
    to: Agent.nullable(),
    state: z.string().nullable().openapi({ description: "The task's new state, where the event set one", example: "done" }),
    provider: z.string().nullable().openapi({ description: "From the speaker stamp; null for a label move or before urb 0.5.43", example: "claude-code:cli" }),
    model: z.string().nullable().openapi({ example: "claude-opus-5-5" }),
  })
  .strict()
  .openapi("Event");

const EventsPage = z
  .object({
    schema: z.literal(SCHEMA),
    events: z.array(EventSchema),
    next: z.string().nullable().openapi({ description: "Pass as `before` for the next, older page; null on the last page" }),
    note: z.string().optional().openapi({ description: "Present when the feed has no database behind it yet" }),
  })
  .openapi("EventsPage");

const AgentSummary = z
  .object({
    id: Agent,
    opened: z.number().int().openapi({ description: "Tasks it opened" }),
    received: z.number().int().openapi({ description: "Tasks opened to it" }),
    replied: z.number().int(),
    moved: z.number().int(),
    closed: z.number().int(),
    lastSeen: z.string().datetime(),
  })
  .strict()
  .openapi("AgentSummary");

const AgentsPage = z
  .object({
    schema: z.literal(SCHEMA),
    since: z.string().datetime(),
    agents: z.array(AgentSummary),
    note: z.string().optional(),
  })
  .openapi("AgentsPage");

const Problem = z.object({ error: z.string() }).openapi("Problem");

// `before` is an ISO time, or `<time>~<id>` exactly as `next` gives it.
export function parseCursor(v: string): Cursor | null {
  const [at, id, ...rest] = v.split("~");
  const d = new Date(at ?? "");
  if (rest.length > 0 || Number.isNaN(d.getTime()) || id === "") return null;
  return { at: d.toISOString(), id: id ?? null };
}
const cursorOf = (e: Event) => `${e.at}~${e.id}`;

const eventsRoute = createRoute({
  method: "get",
  path: "/events",
  summary: "The fleet's bus events, newest first",
  request: {
    query: z.object({
      before: z.string().optional().refine((v) => v === undefined || parseCursor(v) !== null, "an ISO time, or a `next` value")
        .openapi({ description: "Only events older than this: an ISO time, or the `next` of the previous page" }),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }),
  },
  responses: {
    200: { description: "A page of events", content: { "application/json": { schema: EventsPage } } },
    400: { description: "A query parameter is not valid", content: { "application/json": { schema: Problem } } },
  },
});

const agentsRoute = createRoute({
  method: "get",
  path: "/agents",
  summary: "Per agent over the last 24 hours: what it did, and when it was last seen",
  responses: {
    200: { description: "One row per agent, most recently seen first", content: { "application/json": { schema: AgentsPage } } },
  },
});

export function createApi(store: Store, note?: string) {
  const api = new OpenAPIHono({
    // A bad query answers with one short sentence, not Zod's issue tree.
    defaultHook: (result, c) => {
      if (!result.success) {
        const i = result.error.issues[0];
        return c.json({ error: `${i?.path.join(".") || "query"}: ${i?.message ?? "not valid"}` }, 400);
      }
    },
  });

  // `api-` means public: any website may read it (and the marketing site will). Read-only.
  api.use("*", cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"] }));

  api.openapi(eventsRoute, async (c) => {
    const { before, limit } = c.req.valid("query");
    const events = await store.readEvents({ limit, before: before ? parseCursor(before)! : undefined });
    c.header("Cache-Control", CACHE);
    const last = events[events.length - 1];
    return c.json({ schema: SCHEMA, events, next: events.length === limit && last ? cursorOf(last) : null, ...(note ? { note } : {}) }, 200);
  });

  api.openapi(agentsRoute, async (c) => {
    const since = new Date(Date.now() - 86_400_000);
    c.header("Cache-Control", CACHE);
    return c.json({ schema: SCHEMA, since: since.toISOString(), agents: await store.agents(since), ...(note ? { note } : {}) }, 200);
  });

  api.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "urb-agents fleet events",
      version: "1",
      description:
        "What the Urbalurba agent fleet is doing on its bus, close to real time. Public, credential-free and read-only. " +
        "Every event is the urb events contract and nothing more: never a task's title, body or number, never a subscription. " +
        `An id the console has not been told it may name is shown as \`${OTHERS}\`.`,
    },
    servers: [{ url: "/v1" }],
  });

  return api;
}
