import { expect, test } from "bun:test";
import { OTHERS } from "./allowlist";
import { EVENT_FIELDS, parseEvent, parseEvents } from "./event";

const row = {
  id: "a1b2c3", at: "2026-09-28T07:22:47Z", kind: "replied",
  from: "ops-dev", to: "marketing", state: "done",
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
  expect(parseEvent({ ...row, from: "rc-eval", to: "terje" })).toMatchObject({ from: OTHERS, to: OTHERS });
  expect(parseEvent({ ...row, to: "urbalurba" })).toMatchObject({ from: "ops-dev", to: OTHERS });
});

test("a row missing what it needs is dropped", () => {
  for (const bad of [
    { ...row, id: undefined }, { ...row, id: "" }, { ...row, kind: "deleted" },
    { ...row, at: "yesterday" }, { ...row, from: null }, { ...row, from: "Not An Id" },
    null, "text", [row],
  ]) expect(parseEvent(bad)).toBeNull();
});

test("free text cannot ride in on a harmless-looking field", () => {
  const e = parseEvent({ ...row, state: "done <script>", model: "a model with spaces", provider: 42, to: "x y" });
  expect(e).toMatchObject({ state: null, model: null, provider: null, to: null });
});

test("provider and model may be null, as the contract says", () => {
  expect(parseEvent({ ...row, kind: "moved", provider: null, model: null })).toMatchObject({ provider: null, model: null });
});

test("output is read as a JSON array or as one object per line", () => {
  const two = [row, { ...row, id: "d4e5f6" }];
  expect(parseEvents(JSON.stringify(two)).events).toHaveLength(2);
  expect(parseEvents(two.map((r) => JSON.stringify(r)).join("\n") + "\n").events).toHaveLength(2);
  expect(parseEvents("")).toEqual({ events: [], dropped: 0 });
  expect(parseEvents(JSON.stringify([row, { kind: "x" }])).dropped).toBe(1);
});

test("output that is not JSON throws, so the collector keeps its mark", () => {
  expect(() => parseEvents("rate limited")).toThrow();
});
