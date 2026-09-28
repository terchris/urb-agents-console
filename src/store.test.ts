// One set of behaviours, run against both stores. The Postgres half runs only when
// TEST_DATABASE_URL names a database it may wipe (CI sets one; locally, any throwaway Postgres).
import { SQL } from "bun";
import { beforeEach, describe, expect, test } from "bun:test";
import type { Event } from "./event";
import { MemoryStore, PgStore, type WritableStore } from "./store";

const ev = (id: string, at: string, over: Partial<Event> = {}): Event => ({
  id, at, kind: "replied", from: "ops-dev", to: "marketing", state: "done",
  provider: "claude-code:cli", model: "claude-opus-5-5", ...over,
});

const url = process.env.TEST_DATABASE_URL;
const stores: [string, () => Promise<WritableStore>][] = [["memory", async () => new MemoryStore()]];
if (url) {
  stores.push(["postgres", async () => {
    const sql = new SQL(url);
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
      await s.collect([e], null);
      expect(await s.readEvents({ limit: 1 })).toEqual([e]);
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

    test("agents counts each end of each event since a time", async () => {
      await s.collect([
        ev("1", "2026-09-28T07:00:00.000Z", { kind: "opened", from: "ops-dev", to: "marketing" }),
        ev("2", "2026-09-28T07:05:00.000Z", { kind: "replied", from: "marketing", to: "ops-dev" }),
        ev("3", "2026-09-28T07:06:00.000Z", { kind: "moved", from: "marketing", to: null }),
        ev("0", "2026-09-27T07:00:00.000Z", { kind: "opened", from: "atlas", to: "ops-dev" }),
      ], null);
      const a = await s.agents(new Date("2026-09-28T00:00:00Z"));
      expect(a).toEqual([
        { id: "marketing", opened: 0, received: 1, replied: 1, moved: 1, closed: 0, lastSeen: "2026-09-28T07:06:00.000Z" },
        { id: "ops-dev", opened: 1, received: 0, replied: 0, moved: 0, closed: 0, lastSeen: "2026-09-28T07:05:00.000Z" },
      ]);
    });

    test("prune deletes only what is older than the cut", async () => {
      await s.collect([ev("old", "2026-06-01T00:00:00.000Z"), ev("new", "2026-09-28T00:00:00.000Z")], null);
      expect(await s.prune(new Date("2026-07-01T00:00:00Z"))).toBe(1);
      expect((await s.readEvents({ limit: 10 })).map((e) => e.id)).toEqual(["new"]);
    });
  });
}
