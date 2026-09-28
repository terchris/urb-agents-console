import { expect, test } from "bun:test";
import { createApp, NO_DATABASE } from "./app";
import { DirectoryCache, parseDirectory } from "./directory";
import { EVENT_FIELDS, type Event } from "./event";
import { MemoryStore } from "./store";

const ev = (id: string, at: string, over: Partial<Event> = {}): Event => ({
  id, at, kind: "replied", from: "ops-dev", to: "marketing", by: "marketing", state: "done",
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
  const app = await withEvents([ev("a", "2026-09-28T07:00:00.000Z", { to: null, by: null, provider: null, model: null })]);
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

test("network serves the pairs and nodes over a window, and refuses an unknown window or agent", async () => {
  const now = Date.now();
  const app = await withEvents([
    ev("1", new Date(now - 60_000).toISOString(), { kind: "opened", from: "ops-dev", to: "imac", by: null }),
    ev("2", new Date(now - 3 * 86_400_000).toISOString(), { kind: "opened", from: "atlas", to: "imac", by: null }),
  ]);
  const day = await json(await app.request("/v1/network"));
  expect(day.window).toBe("24h");
  expect(day.links).toEqual([{ from: "ops-dev", to: "imac", events: 1, opened: 1, replies: 0 }]);
  const week = await json(await app.request("/v1/network?window=7d"));
  expect(week.links).toHaveLength(2);
  expect((await app.request("/v1/network?window=1y")).status).toBe(400);
  expect((await json(await app.request("/v1/events?agent=atlas"))).events.map((e: Event) => e.id)).toEqual(["2"]);
  expect((await app.request("/v1/events?agent=rc-eval")).status).toBe(400);
});

test("activity serves one bucket per hour for 24h, the last holding now", async () => {
  const now = Date.now();
  const app = await withEvents([
    // at `now` itself: "a minute ago" falls in the previous hour during each hour's first minute
    ev("1", new Date(now).toISOString(), { kind: "opened", from: "ops-dev", to: "imac", by: null }),
    ev("2", new Date(now - 5 * 3_600_000).toISOString(), { kind: "opened", from: "atlas", to: "imac", by: null }),
  ]);
  const a = await json(await app.request("/v1/activity"));
  expect(a.bucket.size).toBe("1h");
  expect(a.buckets).toHaveLength(24);
  expect(a.total.reduce((x: number, n: number) => x + n, 0)).toBe(2);
  expect(a.total[23]).toBe(1);
  expect(a.agents[0]).toEqual({ id: "imac", counts: expect.any(Array), events: 2 });
  expect((await json(await app.request("/v1/activity?window=30d"))).buckets).toHaveLength(30);
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
  expect(b.agents.find((a: { id: string }) => a.id === "marketing")).toEqual(expect.objectContaining({ received: 1, opened: 0, replied: 0 }));
  expect(Object.keys(b.agents[0]).sort()).toEqual(["id", "lastSeen", "models", "opened", "received", "replied"]);
});

test("the API describes itself as OpenAPI 3.1, and the Event schema is exactly the contract", async () => {
  const r = await createApp(new MemoryStore()).request("/v1/openapi.json");
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBe("*");
  const doc = await json(r);
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths).sort()).toEqual(["/activity", "/agents", "/events", "/network"]);
  const event = doc.components.schemas.Event;
  expect(Object.keys(event.properties).sort()).toEqual([...EVENT_FIELDS].sort());
  expect(event.additionalProperties).toBe(false);
  expect(event.properties.to.type).toEqual(["string", "null"]); // 3.1 nullability, not 3.0's `nullable`
});

test("the page renders the events and the agents, with others marked as such", async () => {
  const now = Date.now();
  const app = await withEvents([
    ev("1", new Date(now - 60_000).toISOString(), { kind: "opened", from: "ops-dev", to: "others" }),
    ev("2", new Date(now - 30_000).toISOString(), { kind: "moved", from: "imac", to: "ops-dev", by: null, state: "working", provider: null, model: null }),
    ev("3", new Date(now - 20_000).toISOString(), { kind: "replied", from: "imac", to: "ops-dev", by: "ops-dev" }),
    ev("4", new Date(now - 10_000).toISOString(), { kind: "closed", from: "imac", to: "ops-dev", by: null, state: "completed" }),
  ]);
  const r = await app.request("/");
  expect(r.status).toBe(200);
  const html = await r.text();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("The fleet, live");
  expect(html).toContain('<span class="who">ops-dev</span> opened a task for <span class="who others"');
  // A move and a close say what happened to the task, never who did it: the contract doesn't say.
  expect(html).toContain('A task from <span class="who">imac</span> to <span class="who">ops-dev</span> moved to <b class="state">working</b>');
  expect(html).toContain('was closed as <b class="state">completed</b>');
  expect(html).toContain('<span class="who">ops-dev</span> replied to <span class="who">imac</span>');
  expect(html).toContain('<tr class="others" data-name="others"');
  expect(html).not.toContain("Older events"); // one page only
});

test("with no database the page says so, and does not fail", async () => {
  const html = await (await createApp(new MemoryStore(), NO_DATABASE).request("/")).text();
  expect(html).toContain(NO_DATABASE);
  expect(html).toContain("No events yet.");
});

test("the page pages back without JavaScript, and a bad cursor goes home", async () => {
  const base = Date.parse("2026-09-28T07:00:00Z");
  const app = await withEvents(Array.from({ length: 120 }, (_, i) => ev(`e${String(i).padStart(3, "0")}`, new Date(base + i * 60_000).toISOString())));
  const first = await (await app.request("/")).text();
  const next = first.match(/href="\/\?before=([^"]+)">Older events/)?.[1];
  expect(next).toBeDefined();
  const older = await (await app.request(`/?before=${next}`)).text();
  expect((older.match(/class="ev /g) ?? []).length).toBe(20);
  expect(older).toContain('data-paged="1"');
  const bad = await app.request("/?before=nonsense");
  expect(bad.status).toBe(302);
  expect(bad.headers.get("location")).toBe("/");
});

test("the page leads with the network, and following an agent emphasises its links", async () => {
  const now = Date.now();
  const app = await withEvents([
    ev("1", new Date(now - 60_000).toISOString(), { kind: "opened", from: "ops-dev", to: "imac", by: null }),
    ev("2", new Date(now - 50_000).toISOString(), { kind: "opened", from: "atlas", to: "tor-agent", by: null }),
  ]);
  const all = await (await app.request("/")).text();
  expect(all).toContain('<svg class="net"');
  expect(all).toContain('data-pair="ops-dev&gt;imac"');
  expect(all).toContain("Show as a table (2 connections)");
  const one = await (await app.request("/?agent=imac")).text();
  expect(one).toContain('<svg class="net has-sel"');
  expect(one).toMatch(/class="link hot" data-pair="ops-dev&gt;imac"/);
  expect(one).toMatch(/class="link" data-pair="atlas&gt;tor-agent"/);
  expect(one).toContain('<option value="imac" selected="">imac</option>');
  expect(one).toContain('id="stop-following"');
  expect((await app.request("/?agent=rc-eval")).status).toBe(302);
  expect((await app.request("/?window=1y")).status).toBe(302);
});

test("the embed is the network alone, its links open the full page at the top", async () => {
  const app = await withEvents([ev("1", new Date().toISOString(), { kind: "opened", from: "ops-dev", to: "imac", by: null })]);
  const r = await app.request("/embed/network?window=7d");
  expect(r.status).toBe(200);
  const html = await r.text();
  expect(html).toContain('<svg class="net"');
  expect(html).toContain('target="_top"');
  expect(html).not.toContain('id="live"');
  expect((await app.request("/embed/network?agent=imac")).status).toBe(400);
});

test("the insights: a summary from counts, an inventory with models and who is active, a histogram that jumps", async () => {
  const now = Date.now();
  const app = await withEvents([
    ev("1", new Date(now - 2 * 60_000).toISOString(), { kind: "opened", from: "ops-dev", to: "imac", by: null, model: "Opus 5.5 (1M context)" }),
    ev("2", new Date(now - 3 * 3_600_000).toISOString(), { kind: "replied", from: "ops-dev", to: "imac", by: "imac", model: "Sonnet 5" }),
  ]);
  const html = await (await app.request("/")).text();
  expect(html).toContain("In the last 24 hours: 2 events between 2 agents.");
  expect(html).toContain("Who opened the most tasks: ops-dev (1); received the most: imac (1); wrote the most replies: imac (1).");
  expect(html).toContain("Active in the last 10 minutes: imac, ops-dev.");
  expect(html).toMatch(/<tr data-name="ops-dev" data-events="2"/);
  expect(html).toContain("Opus 5.5 (1M context)");
  expect(html).toContain('<svg class="spark"');
  expect(html).toMatch(/class="node active"/);
  expect((html.match(/<nav class="histo"[\s\S]*?<\/nav>/)?.[0].match(/<a /g) ?? []).length).toBe(24);
  const one = await (await app.request("/?agent=imac")).text();
  expect(one).toContain("imac took part in 2 events in the last 24 hours; received 1, most from ops-dev (1); wrote 1 reply.");
  expect((await app.request("/?agent=")).status).toBe(200); // the picker's "everyone"
});

test("with marketing's list read, agents show their avatar, role and page; one without a page shows none", async () => {
  const dir = new DirectoryCache(async () => parseDirectory({
    schema: "marketing-agents/1",
    named: ["ops-dev", "imac", "terje"],
    agents: [{ id: "ops-dev", role: "the dispatcher", page: "https://marketing.urbalurba.com/fleet/ops-dev/", avatar: "https://marketing.urbalurba.com/avatars/ops-dev.svg" }],
  }, "https://marketing.urbalurba.com/fleet/agents.json"));
  await dir.refresh();
  const s = new MemoryStore();
  await s.collect([ev("1", new Date().toISOString(), { kind: "opened", from: "ops-dev", to: "terje", by: null })], null);
  const app = createApp(s, undefined, dir);
  const html = await (await app.request("/")).text();
  expect(html).toContain('<image href="https://marketing.urbalurba.com/avatars/ops-dev.svg"');
  expect(html).toContain('<img class="av" src="https://marketing.urbalurba.com/avatars/ops-dev.svg"');
  expect(html).toContain('<span class="role">the dispatcher</span>');
  expect(html).toContain('href="https://marketing.urbalurba.com/fleet/ops-dev/"');
  expect(html).not.toContain("avatars/terje.svg");
  const one = await (await app.request("/?agent=ops-dev")).text();
  expect(one).toContain(">About ops-dev</a>");
  const embed = await (await app.request("/embed/network")).text();
  expect(embed).toContain("avatars/ops-dev.svg");
});

test("the live partial is the fragment only, never cached", async () => {
  const r = await (await withEvents([ev("a", new Date().toISOString())])).request("/partials/live");
  expect(r.headers.get("cache-control")).toBe("no-store");
  const html = await r.text();
  expect(html.startsWith('<div id="live"')).toBe(true);
  expect(html).not.toContain("<html");
});
