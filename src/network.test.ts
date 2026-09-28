import { expect, test } from "bun:test";
import { ALLOWLIST, OTHERS } from "./allowlist";
import { BOX, curve, layout, layoutOrder, linkWidth, nodeRadius, positions } from "./network";

test("every allowlisted agent has a fixed place, and others comes last", () => {
  const order = layoutOrder();
  expect(new Set(order)).toEqual(new Set([...ALLOWLIST, OTHERS]));
  expect(order[order.length - 1]).toBe(OTHERS);
  expect(order[0]).toBe("terje");
});

test("an agent missing from the curated order is still placed, before others", () => {
  const order = layoutOrder(new Set(["ops-dev", "brand-new"]));
  expect(order).toEqual(["ops-dev", "brand-new", OTHERS]);
});

test("positions are on the circle, the first at the top", () => {
  const p = positions(["a", "b", "c", "d"]);
  expect(p.get("a")).toMatchObject({ x: BOX.cx, y: BOX.cy - BOX.radius });
  for (const q of p.values()) expect(Math.hypot(q.x - BOX.cx, q.y - BOX.cy)).toBeCloseTo(BOX.radius, 6);
});

test("sizes are square-root scaled and never vanish", () => {
  expect(nodeRadius(0, 10)).toBe(3);
  expect(nodeRadius(10, 10)).toBe(16);
  expect(nodeRadius(1, 100)).toBeGreaterThan(5);
  expect(linkWidth(100, 100)).toBe(8);
  expect(linkWidth(25, 100)).toBeCloseTo(1.25 + 6.75 * 0.5, 1);
});

test("A→B and B→A bend to opposite sides, so they never overlap", () => {
  const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
  const ab = curve(a, b, 5, 5, 2).mid, ba = curve(b, a, 5, 5, 2).mid;
  expect(Math.sign(ab.y)).toBe(-Math.sign(ba.y));
  expect(Math.abs(ab.y)).toBeGreaterThan(5);
});

test("a curve starts and ends outside the node discs", () => {
  const c = curve({ x: 0, y: 0 }, { x: 200, y: 0 }, 10, 16, 2);
  const [sx, sy] = c.d.slice(1).split(" ").map(Number);
  expect(Math.hypot(sx!, sy!)).toBeGreaterThan(10);
  const [tx, ty] = c.head.slice(1).split(" ").map(Number);
  expect(Math.hypot(tx! - 200, ty!)).toBeGreaterThan(16);
});

test("layout draws the links between placed agents, heaviest last, and keeps loops for the table", () => {
  const laid = layout({
    nodes: [{ id: "ops-dev", events: 9 }, { id: "imac", events: 5 }],
    links: [
      { from: "ops-dev", to: "imac", events: 5, opened: 2, replies: 2 },
      { from: "imac", to: "ops-dev", events: 1, opened: 1, replies: 0 },
      { from: "ops-dev", to: "ops-dev", events: 3, opened: 1, replies: 1 },
    ],
  });
  expect(laid.nodes).toHaveLength(layoutOrder().length);
  expect(laid.links.map((l) => `${l.from}>${l.to}`)).toEqual(["imac>ops-dev", "ops-dev>imac"]);
  expect(laid.loops).toHaveLength(1);
  expect(laid.nodes.find((n) => n.id === "atlas")).toMatchObject({ r: 3, events: 0 });
});
