import { expect, test } from "bun:test";
import { parseDirectory, sameList } from "./directory";

const BASE = "https://marketing.urbalurba.com/fleet/agents.json";
const good = {
  schema: "marketing-agents/1",
  named: ["ops-dev", "terje", "urb-agents-maintainer"],
  agents: [
    { id: "ops-dev", role: "the dispatcher", page: "https://marketing.urbalurba.com/fleet/ops-dev/", avatar: "https://marketing.urbalurba.com/avatars/ops-dev.svg" },
    { id: "rc-eval", role: "x", page: "https://marketing.urbalurba.com/fleet/rc-eval/", avatar: "https://marketing.urbalurba.com/avatars/rc-eval.svg" },
  ],
};

test("marketing's list: named ids, and a profile for each named agent with a page", () => {
  const d = parseDirectory(good, BASE);
  expect([...d.named]).toEqual(["ops-dev", "terje", "urb-agents-maintainer"]);
  expect(d.profiles.get("ops-dev")).toEqual({ id: "ops-dev", role: "the dispatcher", page: good.agents[0]!.page, avatar: good.agents[0]!.avatar });
  expect(d.profiles.has("rc-eval")).toBe(false); // a profile for an id that is not named is ignored
  expect(d.profiles.has("terje")).toBe(false);   // named, but no page
});

test("another schema, or no named list, is refused whole", () => {
  expect(() => parseDirectory({ ...good, schema: "marketing-agents/2" }, BASE)).toThrow(/schema/);
  expect(() => parseDirectory({ schema: "marketing-agents/1" }, BASE)).toThrow(/named/);
  expect(() => parseDirectory(null, BASE)).toThrow();
});

test("a URL on another host, or not https, and a role that is not plain text, are dropped", () => {
  const d = parseDirectory({ ...good, agents: [{ id: "ops-dev", role: "<b>boss</b>", page: "http://marketing.urbalurba.com/x", avatar: "https://evil.example/a.svg" }] }, BASE);
  expect(d.profiles.get("ops-dev")).toEqual({ id: "ops-dev", role: null, page: null, avatar: null });
});

test("an id that is not shaped like a bus id is not named", () => {
  expect([...parseDirectory({ ...good, named: ["ops-dev", "Not An Id", 7] }, BASE).named]).toEqual(["ops-dev"]);
});

test("sameList ignores order", () => {
  expect(sameList(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
  expect(sameList(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
});
