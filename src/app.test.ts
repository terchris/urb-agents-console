import { expect, test } from "bun:test";
import { createApp, NO_DATABASE } from "./app";
import { EVENT_FIELDS, type Event } from "./event";
import { MemoryStore } from "./store";

const ev = (id: string, at: string, over: Partial<Event> = {}): Event => ({
  id, at, kind: "replied", from: "ops-dev", to: "marketing", state: "done",
  provider: "claude-code:cli", model: "claude-opus-5-5", ...over,
});

async function withEvents(events: Event[]) {
  const s = new MemoryStore();
  await s.collect(events, null);
  return createApp(s);
}
const json = async (r: Response) => (await r.json()) as Record<string, any>;

test("the health check answers", async () => {
  const r = await createApp(new MemoryStore()).request("/healthz");
  expect(r.status).toBe(200);
  expect(await r.text()).toBe("ok");
});

test("with no database the feed is empty, open to any origin, and says why", async () => {
  const r = await createApp(new MemoryStore(), NO_DATABASE).request("/v1/events", { headers: { Origin: "https://example.org" } });
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBe("*");
  expect(await json(r)).toEqual({ schema: "urb-events/1", events: [], next: null, note: NO_DATABASE });
});

test("events come newest first, cached for 30 s, and page without losing ties", async () => {
  const same = "2026-09-28T07:00:00.000Z";
  const app = await withEvents([ev("a", same), ev("b", same), ev("c", "2026-09-28T08:00:00.000Z"), ev("d", "2026-09-28T06:00:00.000Z")]);
  const r1 = await app.request("/v1/events?limit=2");
  expect(r1.headers.get("cache-control")).toBe("public, max-age=30");
  const p1 = await json(r1);
  expect(p1.events.map((e: Event) => e.id)).toEqual(["c", "b"]);
  expect(p1.next).toBe(`${same}~b`);
  const p2 = await json(await app.request(`/v1/events?limit=2&before=${encodeURIComponent(p1.next)}`));
  expect(p2.events.map((e: Event) => e.id)).toEqual(["a", "d"]);
  const p3 = await json(await app.request(`/v1/events?limit=2&before=${encodeURIComponent(p2.next)}`));
  expect(p3).toMatchObject({ events: [], next: null });
  expect((await json(await app.request(`/v1/events?before=${same}`))).events.map((e: Event) => e.id)).toEqual(["d"]);
});

test("no event served carries a key outside the contract", async () => {
  const app = await withEvents([ev("a", "2026-09-28T07:00:00.000Z", { to: null, provider: null, model: null })]);
  const body = await json(await app.request("/v1/events"));
  expect(Object.keys(body).sort()).toEqual(["events", "next", "schema"]);
  for (const e of body.events) expect(Object.keys(e).sort()).toEqual([...EVENT_FIELDS].sort());
});

test("a bad query is a 400 with one short sentence", async () => {
  const app = createApp(new MemoryStore());
  for (const q of ["limit=0", "limit=501", "limit=ten", "before=yesterday", "before=2026-09-28T07:00:00Z~", "before=a~b~c"]) {
    const r = await app.request(`/v1/events?${q}`);
    expect(r.status).toBe(400);
    const b = await json(r);
    expect(Object.keys(b)).toEqual(["error"]);
    expect(b.error.length).toBeLessThan(200);
  }
});

test("the API is read-only", async () => {
  const r = await createApp(new MemoryStore()).request("/v1/events", { method: "POST", body: "{}" });
  expect([404, 405]).toContain(r.status);
});

test("agents counts the last 24 hours", async () => {
  const now = Date.now();
  const app = await withEvents([
    ev("1", new Date(now - 60_000).toISOString(), { kind: "opened", from: "ops-dev", to: "marketing" }),
    ev("2", new Date(now - 2 * 86_400_000).toISOString(), { kind: "opened", from: "atlas", to: "imac" }),
  ]);
  const b = await json(await app.request("/v1/agents"));
  expect(b.schema).toBe("urb-events/1");
  expect(b.agents.map((a: { id: string }) => a.id).sort()).toEqual(["marketing", "ops-dev"]);
  expect(b.agents.find((a: { id: string }) => a.id === "marketing")).toMatchObject({ received: 1, opened: 0 });
});

test("the API describes itself as OpenAPI 3.1, and the Event schema is exactly the contract", async () => {
  const r = await createApp(new MemoryStore()).request("/v1/openapi.json");
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBe("*");
  const doc = await json(r);
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths).sort()).toEqual(["/agents", "/events"]);
  const event = doc.components.schemas.Event;
  expect(Object.keys(event.properties).sort()).toEqual([...EVENT_FIELDS].sort());
  expect(event.additionalProperties).toBe(false);
  expect(event.properties.to.type).toEqual(["string", "null"]); // 3.1 nullability, not 3.0's `nullable`
});

test("the frontend page renders", async () => {
  const r = await createApp(new MemoryStore()).request("/");
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("The fleet, live");
});
