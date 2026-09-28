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

test("marketing's description is kept as plain text, and a link must be https (a repository on github.com)", () => {
  const d = parseDirectory({ ...good, agents: [{
    ...good.agents[0],
    summary: "Runs the noticeboard — the whole fleet talks through it.",
    does: ["Brings every new agent in", "<script>x</script>", 42],
    skills: ["routing work", "C#"],
    product: { label: "atlas.sovereignsky.no", href: "https://atlas.sovereignsky.no/" },
    repository: "https://gitlab.example/x",
    checked: "2026-09-28",
  }] }, BASE);
  expect(d.profiles.get("ops-dev")).toMatchObject({
    summary: "Runs the noticeboard — the whole fleet talks through it.",
    does: ["Brings every new agent in"],
    skills: ["routing work", "C#"],
    product: { label: "atlas.sovereignsky.no", href: "https://atlas.sovereignsky.no/" },
    checked: "2026-09-28",
  });
  expect(d.profiles.get("ops-dev")!.repository).toBeUndefined();
});

test("absent means absent", () => {
  const p = parseDirectory(good, BASE).profiles.get("ops-dev")!;
  expect(p.summary).toBeUndefined();
  expect(p.product).toBeUndefined();
});

test("sameList ignores order", () => {
  expect(sameList(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
  expect(sameList(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
});
