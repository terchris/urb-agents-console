// One set of behaviours, run against both stores. The Postgres half runs only when
// TEST_DATABASE_URL names a database it may wipe (CI sets one; locally, any throwaway Postgres).
import { SQL } from "bun";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { Event } from "./event";
import { MemoryStore, PgStore, type WritableStore } from "./store";

const ev = (id: string, at: string, over: Partial<Event> = {}): Event => ({
  id, at, kind: "replied", from: "ops-dev", to: "marketing", by: null, state: "done",
  provider: "claude-code:cli", model: "claude-opus-5-5", ...over,
});

const url = process.env.TEST_DATABASE_URL;
const stores: [string, () => Promise<WritableStore>][] = [["memory", async () => new MemoryStore()]];
if (url) {
  // One client for the whole file: a new pool per test runs Postgres out of connections.
  const sql = new SQL(url);
  afterAll(() => sql.close());
  stores.push(["postgres", async () => {
    await sql.unsafe("DROP TABLE IF EXISTS events, collector_mark");
    await sql.unsafe(await Bun.file(new URL("../config/init-database.sql", import.meta.url)).text());
    return new PgStore(sql);
  }]);
}

for (const [name, make] of stores) {
  describe(name, () => {
    let s: WritableStore;
    beforeEach(async () => {
      s = await make();
    });

    test("collect inserts new rows, ignores ones it has, and moves the mark", async () => {
      expect(await s.getMark()).toBeNull();
      expect(await s.collect([ev("a", "2026-09-28T07:00:00.000Z"), ev("b", "2026-09-28T07:01:00.000Z")], new Date("2026-09-28T07:01:00Z"))).toBe(2);
      expect(await s.collect([ev("b", "2026-09-28T07:01:00.000Z"), ev("c", "2026-09-28T07:02:00.000Z")], new Date("2026-09-28T07:02:00Z"))).toBe(1);
      expect((await s.getMark())?.toISOString()).toBe("2026-09-28T07:02:00.000Z");
      expect((await s.readEvents({ limit: 10 })).map((e) => e.id)).toEqual(["c", "b", "a"]);
    });

    test("the mark never moves backwards", async () => {
      await s.collect([], new Date("2026-09-28T08:00:00Z"));
      await s.collect([], new Date("2026-09-28T07:00:00Z"));
      expect((await s.getMark())?.toISOString()).toBe("2026-09-28T08:00:00.000Z");
    });

    test("rows come back exactly as they went in", async () => {
      const e = ev("x", "2026-09-28T07:22:47.000Z", { to: null, provider: null, model: null, kind: "moved" });
      const r = ev("y", "2026-09-28T07:22:48.000Z", { by: "marketing", model: "Opus 5.5 (1M context)" });
      await s.collect([r], null);
      expect(await s.readEvents({ limit: 1 })).toEqual([r]);
      await s.collect([e], null);
      expect(await s.readEvents({ limit: 2 })).toEqual([r, e]);
    });

    test("paging by cursor loses nothing when events share a timestamp", async () => {
      const same = "2026-09-28T07:00:00.000Z";
      await s.collect([ev("a", same), ev("b", same), ev("c", same), ev("d", "2026-09-28T06:00:00.000Z")], null);
      const p1 = await s.readEvents({ limit: 2 });
      const last = p1[p1.length - 1]!;
      const p2 = await s.readEvents({ limit: 2, before: { at: last.at, id: last.id } });
      expect([...p1, ...p2].map((e) => e.id)).toEqual(["c", "b", "a", "d"]);
      const byTime = await s.readEvents({ limit: 10, before: { at: same, id: null } });
      expect(byTime.map((e) => e.id)).toEqual(["d"]);
    });

    test("agents credits only what the contract attributes: opened, received, and replies by `by`", async () => {
      await s.collect([
        ev("1", "2026-09-28T07:00:00.000Z", { kind: "opened", from: "ops-dev", to: "marketing" }),
        ev("2", "2026-09-28T07:05:00.000Z", { kind: "replied", from: "ops-dev", to: "marketing", by: "marketing" }),
        ev("3", "2026-09-28T07:06:00.000Z", { kind: "moved", from: "ops-dev", to: "marketing", state: "done" }),
        ev("4", "2026-09-28T07:07:00.000Z", { kind: "replied", from: "atlas", to: "imac", by: null }),
        ev("0", "2026-09-27T07:00:00.000Z", { kind: "opened", from: "atlas", to: "ops-dev" }),
      ], null);
      const a = await s.agents(new Date("2026-09-28T00:00:00Z"));
      expect(a).toEqual([
        { id: "atlas", opened: 0, received: 0, replied: 0, lastSeen: "2026-09-28T07:07:00.000Z" },
        { id: "imac", opened: 0, received: 0, replied: 0, lastSeen: "2026-09-28T07:07:00.000Z" },
        { id: "marketing", opened: 0, received: 1, replied: 1, lastSeen: "2026-09-28T07:06:00.000Z" },
        { id: "ops-dev", opened: 1, received: 0, replied: 0, lastSeen: "2026-09-28T07:06:00.000Z" },
      ]);
      expect(await s.count(new Date("2026-09-28T00:00:00Z"))).toBe(4);
    });

    test("network counts each ordered pair and each agent's involvement", async () => {
      await s.collect([
        ev("1", "2026-09-28T07:00:00.000Z", { kind: "opened", from: "ops-dev", to: "imac" }),
        ev("2", "2026-09-28T07:01:00.000Z", { kind: "replied", from: "ops-dev", to: "imac", by: "imac" }),
        ev("3", "2026-09-28T07:02:00.000Z", { kind: "moved", from: "ops-dev", to: "imac" }),
        ev("4", "2026-09-28T07:03:00.000Z", { kind: "opened", from: "imac", to: "ops-dev" }),
        ev("5", "2026-09-28T07:04:00.000Z", { kind: "moved", from: "atlas", to: null }),
        ev("0", "2026-09-27T07:00:00.000Z", { kind: "opened", from: "tor-agent", to: "imac" }),
      ], null);
      expect(await s.network(new Date("2026-09-28T00:00:00Z"))).toEqual({
        links: [
          { from: "ops-dev", to: "imac", events: 3, opened: 1, replies: 1 },
          { from: "imac", to: "ops-dev", events: 1, opened: 1, replies: 0 },
        ],
        nodes: [{ id: "imac", events: 4 }, { id: "ops-dev", events: 4 }, { id: "atlas", events: 1 }],
      });
    });

    test("activity counts events into buckets: the fleet's total, and each agent once per event", async () => {
      const origin = Date.parse("2026-09-28T06:00:00Z"), size = 3_600_000;
      await s.collect([
        ev("1", "2026-09-28T06:10:00.000Z", { kind: "opened", from: "ops-dev", to: "imac", by: null }),
        ev("2", "2026-09-28T06:50:00.000Z", { kind: "replied", from: "ops-dev", to: "imac", by: "imac" }),
        ev("3", "2026-09-28T08:00:00.000Z", { kind: "moved", from: "ops-dev", to: "ops-dev", by: null }),
        ev("x", "2026-09-28T05:59:59.000Z", { from: "atlas" }), // before the first bucket
        ev("y", "2026-09-28T09:00:00.000Z", { from: "atlas" }), // after the last
      ], null);
      expect(await s.activity({ origin, size, count: 3 })).toEqual({
        total: [2, 0, 1],
        agents: [
          { id: "ops-dev", counts: [2, 0, 1], events: 3 },
          { id: "imac", counts: [2, 0, 0], events: 2 },
        ],
      });
    });

    test("readEvents can follow one agent in any role", async () => {
      await s.collect([
        ev("1", "2026-09-28T07:00:00.000Z", { from: "ops-dev", to: "imac", by: null }),
        ev("2", "2026-09-28T07:01:00.000Z", { from: "atlas", to: "tor-agent", by: "imac" }),
        ev("3", "2026-09-28T07:02:00.000Z", { from: "atlas", to: "tor-agent", by: null }),
      ], null);
      expect((await s.readEvents({ limit: 10, agent: "imac" })).map((e) => e.id)).toEqual(["2", "1"]);
    });

    test("prune deletes only what is older than the cut", async () => {
      await s.collect([ev("old", "2026-06-01T00:00:00.000Z"), ev("new", "2026-09-28T00:00:00.000Z")], null);
      expect(await s.prune(new Date("2026-07-01T00:00:00Z"))).toBe(1);
      expect((await s.readEvents({ limit: 10 })).map((e) => e.id)).toEqual(["new"]);
    });
  });
}
