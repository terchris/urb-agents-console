// The public API, api-fleet.<domain>/v1/: public, credential-free and read-only, described as
// OpenAPI 3.1 at /v1/openapi.json.
//
// The routes are defined with @hono/zod-openapi: one Zod schema per request and response, which
// validates the query (a bad one is a 400) and is also the published spec, so the two cannot
// drift apart. The event schema is the urb events contract (#1651) field for field, and it is
// strict: nothing else can be described or served.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { ALLOWLIST, OTHERS } from "./allowlist";
import { KINDS, SCHEMA, type Event } from "./event";
import type { Cursor, Store } from "./store";
import { BUCKETS, bucketsFor, ZONE } from "./time";

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
    from: Agent.openapi({ description: "The task's sender, whatever the event" }),
    to: Agent.nullable().openapi({ description: "The task's recipient" }),
    by: Agent.nullable().openapi({ description: "Who acted, where the bus records it (a reply); null otherwise" }),
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
    replied: z.number().int().openapi({ description: "Replies it wrote" }),
    models: z.array(z.object({ name: z.string(), events: z.number().int() }).strict())
      .openapi({ description: "The models it wrote with (a task it opened, a reply it wrote), most used first, at most three. Only where the bus recorded one." }),
    lastSeen: z.string().datetime().openapi({ description: "The latest event it took part in, in any role" }),
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

// The time windows the page and the API offer. Fixed, so a response is cacheable and a link is shareable.
export const WINDOWS = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 } as const;
export type Window = keyof typeof WINDOWS;
const BUCKET_SIZE = { "24h": "1h", "7d": "6h", "30d": "1d" } as const satisfies Record<Window, string>;
const WindowParam = z.enum(Object.keys(WINDOWS) as [Window, ...Window[]]).default("24h")
  .openapi({ description: "How far back to look" });
const AgentParam = z.string().refine((v) => v === OTHERS || ALLOWLIST.has(v), "not an agent this feed names")
  .openapi({ description: `A bus id the feed names, or \`${OTHERS}\``, example: "ops-dev" });

const NetworkSchema = z
  .object({
    schema: z.literal(SCHEMA),
    window: z.enum(Object.keys(WINDOWS) as [Window, ...Window[]]),
    since: z.string().datetime(),
    nodes: z.array(z.object({
      id: Agent,
      events: z.number().int().openapi({ description: "Events it took part in, in any role" }),
    }).strict().openapi("NetworkNode")),
    links: z.array(z.object({
      from: Agent.openapi({ description: "The tasks' sender" }),
      to: Agent.openapi({ description: "The tasks' recipient" }),
      events: z.number().int().openapi({ description: "All events on tasks between the two, in this direction" }),
      opened: z.number().int().openapi({ description: "Tasks opened" }),
      replies: z.number().int().openapi({ description: "Replies written, by either side" }),
    }).strict().openapi("NetworkLink")),
    note: z.string().optional(),
  })
  .openapi("Network");

// `before` is an ISO time, or `<time>~<id>` exactly as `next` gives it.
export function parseCursor(v: string): Cursor | null {
  const [at, id, ...rest] = v.split("~");
  const d = new Date(at ?? "");
  if (rest.length > 0 || Number.isNaN(d.getTime()) || id === "") return null;
  return { at: d.toISOString(), id: id ?? null };
}
export const cursorOf = (e: Event) => `${e.at}~${e.id}`;

const eventsRoute = createRoute({
  method: "get",
  path: "/events",
  summary: "The fleet's bus events, newest first",
  request: {
    query: z.object({
      before: z.string().optional().refine((v) => v === undefined || parseCursor(v) !== null, "an ISO time, or a `next` value")
        .openapi({ description: "Only events older than this: an ISO time, or the `next` of the previous page" }),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      agent: AgentParam.optional().openapi({ description: "Only events this agent took part in, as sender, recipient or replier" }),
    }),
  },
  responses: {
    200: { description: "A page of events", content: { "application/json": { schema: EventsPage } } },
    400: { description: "A query parameter is not valid", content: { "application/json": { schema: Problem } } },
  },
});

const ActivitySchema = z
  .object({
    schema: z.literal(SCHEMA),
    window: z.enum(Object.keys(WINDOWS) as [Window, ...Window[]]),
    bucket: z.object({
      size: z.enum(["1h", "6h", "1d"]),
      zone: z.string().openapi({ description: "Bucket edges sit on this zone's clock", example: "Europe/Oslo" }),
    }),
    buckets: z.array(z.string().datetime()).openapi({ description: "The start of each bucket, oldest first. The last one holds now." }),
    total: z.array(z.number().int()).openapi({ description: "All events per bucket" }),
    agents: z.array(z.object({
      id: Agent,
      counts: z.array(z.number().int()).openapi({ description: "Events it took part in, per bucket, as sender, recipient or replier" }),
      events: z.number().int(),
    }).strict().openapi("AgentActivity")).openapi({ description: "Busiest first; agents with no events in the window are left out" }),
    note: z.string().optional(),
  })
  .openapi("Activity");

const activityRoute = createRoute({
  method: "get",
  path: "/activity",
  summary: "When the fleet works and rests: events per hour (24h), per 6 hours (7d) or per day (30d)",
  request: { query: z.object({ window: WindowParam }) },
  responses: {
    200: { description: "Counts per bucket, for the fleet and per agent", content: { "application/json": { schema: ActivitySchema } } },
    400: { description: "A query parameter is not valid", content: { "application/json": { schema: Problem } } },
  },
});

const networkRoute = createRoute({
  method: "get",
  path: "/network",
  summary: "Who sends work to whom, and how much: the network over a window",
  request: { query: z.object({ window: WindowParam }) },
  responses: {
    200: { description: "Nodes and directed links", content: { "application/json": { schema: NetworkSchema } } },
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
    const { before, limit, agent } = c.req.valid("query");
    const events = await store.readEvents({ limit, agent, before: before ? parseCursor(before)! : undefined });
    c.header("Cache-Control", CACHE);
    const last = events[events.length - 1];
    return c.json({ schema: SCHEMA, events, next: events.length === limit && last ? cursorOf(last) : null, ...(note ? { note } : {}) }, 200);
  });

  api.openapi(networkRoute, async (c) => {
    const { window } = c.req.valid("query");
    const since = new Date(Date.now() - WINDOWS[window]);
    c.header("Cache-Control", CACHE);
    return c.json({ schema: SCHEMA, window, since: since.toISOString(), ...(await store.network(since)), ...(note ? { note } : {}) }, 200);
  });

  api.openapi(activityRoute, async (c) => {
    const { window } = c.req.valid("query");
    const { size, starts } = bucketsFor(window, Date.now());
    const a = await store.activity({ origin: starts[0]!, size, count: starts.length });
    c.header("Cache-Control", CACHE);
    return c.json({
      schema: SCHEMA, window, bucket: { size: BUCKET_SIZE[window], zone: ZONE },
      buckets: starts.map((t) => new Date(t).toISOString()), ...a, ...(note ? { note } : {}),
    }, 200);
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
