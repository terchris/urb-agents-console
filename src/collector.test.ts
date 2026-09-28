import { expect, test } from "bun:test";
import { OTHERS, SNAPSHOT } from "./allowlist";
import { collectOnce as collectWith, FIRST_WINDOW, OVERLAP_MS, prune, refreshNaming, sinceArg, spawnUrb, type Urb } from "./collector";
import { MemoryStore, type WritableStore } from "./store";

const collectOnce = (s: WritableStore, urb: Urb) => collectWith(s, urb, SNAPSHOT);

const row = (id: string, at: string, over: Record<string, unknown> = {}) => ({
  id, at, kind: "replied", from: "ops-dev", to: "marketing", by: "marketing", state: "done",
  provider: "claude-code:cli", model: "claude-opus-5-5", ...over,
});
const urbOf = (rows: unknown[], until?: string): Urb => async (since) =>
  JSON.stringify({ schema: "urb-events/1", since, ...(until ? { until } : {}), events: rows }, null, 2);

test("the first run asks for 24 hours; later runs overlap the mark by 10 minutes", () => {
  expect(sinceArg(null)).toBe(FIRST_WINDOW);
  expect(sinceArg(new Date("2026-09-28T08:00:00Z"))).toBe(new Date(Date.parse("2026-09-28T08:00:00Z") - OVERLAP_MS).toISOString());
});

test("a run inserts, moves the mark to the newest event, and a re-run adds nothing", async () => {
  const s = new MemoryStore();
  const urb = urbOf([row("a", "2026-09-28T07:00:00Z"), row("b", "2026-09-28T07:05:00Z")]);
  expect(await collectOnce(s, urb)).toMatchObject({ since: "24h", fetched: 2, inserted: 2, mark: "2026-09-28T07:05:00.000Z" });
  expect(await collectOnce(s, urb)).toMatchObject({ since: "2026-09-28T06:55:00.000Z", inserted: 0, mark: "2026-09-28T07:05:00.000Z" });
});

test("an unlisted id is stored as others, and a bad row is counted, not stored", async () => {
  const s = new MemoryStore();
  const t = await collectOnce(s, urbOf([row("a", "2026-09-28T07:00:00Z", { from: "rc-eval" }), { id: "x" }]));
  expect(t).toMatchObject({ fetched: 2, inserted: 1, dropped: 1 });
  expect(s.events[0]!.from).toBe(OTHERS);
});

test("a failing urb or output that is not JSON leaves the mark where it was", async () => {
  const s = new MemoryStore();
  await collectOnce(s, urbOf([row("a", "2026-09-28T07:00:00Z")]));
  await expect(collectOnce(s, async () => { throw new Error("rate limited"); })).rejects.toThrow();
  await expect(collectOnce(s, async () => "<html>502</html>")).rejects.toThrow();
  expect((await s.getMark())?.toISOString()).toBe("2026-09-28T07:00:00.000Z");
  expect(s.events).toHaveLength(1);
});

test("an empty window without until keeps the mark", async () => {
  const s = new MemoryStore();
  await collectOnce(s, urbOf([row("a", "2026-09-28T07:00:00Z")]));
  expect((await collectOnce(s, urbOf([]))).mark).toBe("2026-09-28T07:00:00.000Z");
});

test("until moves the mark even through a quiet window, so the next window stays small", async () => {
  const s = new MemoryStore();
  await collectOnce(s, urbOf([row("a", "2026-09-28T07:00:00Z")], "2026-09-28T07:30:00Z"));
  const t = await collectOnce(s, urbOf([], "2026-09-28T08:30:00Z"));
  expect(t).toMatchObject({ since: "2026-09-28T07:20:00.000Z", mark: "2026-09-28T08:30:00.000Z" });
});

test("a changed schema is refused and the mark kept", async () => {
  const s = new MemoryStore();
  await collectOnce(s, urbOf([row("a", "2026-09-28T07:00:00Z")]));
  await expect(collectOnce(s, async () => JSON.stringify({ schema: "urb-events/2", events: [] }))).rejects.toThrow(/schema/);
  expect((await s.getMark())?.toISOString()).toBe("2026-09-28T07:00:00.000Z");
});

test("a late event older than the mark is still stored, and the mark does not go back", async () => {
  const s = new MemoryStore();
  await collectOnce(s, urbOf([row("b", "2026-09-28T07:05:00Z")]));
  const t = await collectOnce(s, urbOf([row("late", "2026-09-28T07:01:00Z")]));
  expect(t).toMatchObject({ inserted: 1, mark: "2026-09-28T07:05:00.000Z" });
});

test("prune keeps the retention period", async () => {
  const s = new MemoryStore();
  await s.collect([], null);
  s.events.push(
    { id: "old", at: "2026-06-01T00:00:00.000Z", kind: "opened", from: "ops", to: "imac", by: null, state: null, provider: null, model: null },
    { id: "new", at: "2026-09-01T00:00:00.000Z", kind: "opened", from: "ops", to: "imac", by: null, state: null, provider: null, model: null },
  );
  expect(await prune(s, 90, new Date("2026-09-28T00:00:00Z"))).toBe(1);
  expect(s.events.map((e) => e.id)).toEqual(["new"]);
});

test("naming: marketing's list is saved; if it cannot be read, the saved one is used; with neither, none", async () => {
  const s = new MemoryStore();
  const down = async (): Promise<ReadonlySet<string>> => { throw new Error("marketing unreachable"); };
  expect(await refreshNaming(s, down)).toBeNull(); // the caller must not collect
  const up = await refreshNaming(s, async () => new Set(["ops-dev", "imac"]));
  expect(up).toMatchObject({ source: "marketing", changed: 0 });
  expect([...(await s.getNamed())!].sort()).toEqual(["imac", "ops-dev"]);
  const fallback = await refreshNaming(s, down);
  expect(fallback?.source).toBe("saved");
  expect([...fallback!.list].sort()).toEqual(["imac", "ops-dev"]);
});

test("naming: an id that leaves marketing's list is folded out of what is already stored", async () => {
  const s = new MemoryStore();
  await refreshNaming(s, async () => new Set(["ops-dev", "imac"]));
  await collectOnce(s, urbOf([row("a", "2026-09-28T07:00:00Z", { from: "ops-dev", to: "imac", by: "imac" })]));
  const n = await refreshNaming(s, async () => new Set(["ops-dev"]));
  expect(n?.changed).toBe(1);
  expect(s.events[0]).toMatchObject({ from: "ops-dev", to: OTHERS, by: OTHERS });
});

// The real process boundary, with the fake urb standing in.
const fake = new URL("../tools/fake-urb.ts", import.meta.url).pathname;

test("spawnUrb runs the binary and returns its JSON", async () => {
  const out = await spawnUrb(fake, 10_000)("24h");
  expect(JSON.parse(out).events).toHaveLength(3);
});

test("spawnUrb throws with urb's own message when it exits non-zero", async () => {
  process.env.FAKE_URB_FAIL = "1";
  try {
    await expect(spawnUrb(fake, 10_000)("24h")).rejects.toThrow(/exited 1: fake-urb: failing on purpose/);
  } finally {
    delete process.env.FAKE_URB_FAIL;
  }
});
