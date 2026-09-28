import { expect, test } from "bun:test";
import { OTHERS, SNAPSHOT } from "./allowlist";
import { EVENT_FIELDS, parseEvent as parseWith, parseEvents as parseAllWith } from "./event";

// These tests fold with the snapshot of marketing's list; the collector folds with the live one.
const parseEvent = (raw: unknown) => parseWith(raw, SNAPSHOT);
const parseEvents = (text: string) => parseAllWith(text, SNAPSHOT);

const row = {
  id: "a1b2c3", at: "2026-09-28T07:22:47Z", kind: "replied",
  from: "ops-dev", to: "marketing", by: "marketing", state: "done",
  provider: "claude-code:cli", model: "claude-opus-5-5",
};

test("a contract row is kept as it is", () => {
  expect(parseEvent(row)).toEqual({ ...row, at: "2026-09-28T07:22:47.000Z" } as never);
});

test("a field the contract does not name is dropped, never stored", () => {
  const e = parseEvent({ ...row, subscription: "max", title: "secret", body: "x", number: 1651 });
  expect(Object.keys(e!).sort()).toEqual([...EVENT_FIELDS].sort());
});

test("an id not on the allowlist is folded to others, on both ends", () => {
  expect(parseEvent({ ...row, from: "rc-eval", to: "someone-new", by: "urbalurba" })).toMatchObject({ from: OTHERS, to: OTHERS, by: OTHERS });
  expect(parseEvent({ ...row, to: "urbalurba" })).toMatchObject({ from: "ops-dev", to: OTHERS });
});

test("terje is shown by name, by his own decision (#1663)", () => {
  expect(parseEvent({ ...row, from: "terje", by: "terje" })).toMatchObject({ from: "terje", by: "terje" });
});

test("a row missing what it needs is dropped", () => {
  for (const bad of [
    { ...row, id: undefined }, { ...row, id: "" }, { ...row, kind: "deleted" },
    { ...row, at: "yesterday" }, { ...row, from: null }, { ...row, from: "Not An Id" },
    null, "text", [row],
  ]) expect(parseEvent(bad)).toBeNull();
});

test("free text cannot ride in on a harmless-looking field", () => {
  const e = parseEvent({ ...row, state: "done <script>", model: "Opus <b>5</b>", provider: 42, to: "x y" });
  expect(e).toMatchObject({ state: null, model: null, provider: null, to: null });
});

test("provider, model and by may be null, as the contract says", () => {
  expect(parseEvent({ ...row, kind: "moved", by: null, provider: null, model: null })).toMatchObject({ by: null, provider: null, model: null });
});

test("a model as urb writes it, with spaces and brackets, is kept", () => {
  expect(parseEvent({ ...row, model: "Opus 5.5 (1M context)" })!.model).toBe("Opus 5.5 (1M context)");
});

const doc = (events: unknown[], over: Record<string, unknown> = {}) =>
  JSON.stringify({ schema: "urb-events/1", since: "2026-09-28T06:00:00Z", until: "2026-09-28T08:00:00Z", events, ...over }, null, 2);

test("output is the urb-events/1 object, pretty-printed or not, and until is read", () => {
  const r = parseEvents(doc([row, { ...row, id: "d4e5f6" }, { kind: "x" }]));
  expect(r.events).toHaveLength(2);
  expect(r.dropped).toBe(1);
  expect(r.until?.toISOString()).toBe("2026-09-28T08:00:00.000Z");
});

test("another schema, or no events array, is refused whole", () => {
  expect(() => parseEvents(doc([row], { schema: "urb-events/2" }))).toThrow(/schema/);
  expect(() => parseEvents(JSON.stringify([row]))).toThrow();
  expect(() => parseEvents(JSON.stringify({ schema: "urb-events/1" }))).toThrow(/events/);
});

test("output that is not JSON throws, so the collector keeps its mark", () => {
  expect(() => parseEvents("rate limited")).toThrow();
});
