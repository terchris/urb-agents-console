// Layout for the network view, as pure functions: positions, curves and widths, no markup.
//
// Agents sit at FIXED places on a circle, in a curated order, whether or not they were active in
// the window, so a reader learns where each one is and nothing jumps when data arrives. A link is
// a quadratic curve that bends to the right of its direction of travel, so A→B and B→A never lie
// on top of each other. Widths and radii are square-root scaled, so area, not length, tracks count.
import { ALLOWLIST, OTHERS } from "./allowlist";
import type { Link, Network } from "./store";

// Neighbours on the circle are agents that often work together: Terje and the coordinators at the
// top, the platform agents next, then the products. Any allowlisted id missing here is placed
// before `others`, which always comes last.
export const ORDER = [
  "terje", "ops-dev", "urb-agents-maintainer", "ops", "imac", "tor-agent", "assist",
  "atlas", "dev-templates", "devcontainer-toolbox", "sovdev-logger", "client-provisioning",
  "noclickops", "marketing", "urb-agents-console",
];

export function layoutOrder(allow: ReadonlySet<string> = ALLOWLIST): string[] {
  const known = ORDER.filter((id) => allow.has(id));
  const rest = [...allow].filter((id) => !ORDER.includes(id));
  return [...known, ...rest, OTHERS];
}

export type Point = { x: number; y: number };
export type Box = { width: number; height: number; cx: number; cy: number; radius: number };

export const BOX: Box = { width: 760, height: 520, cx: 380, cy: 260, radius: 175 };

export function positions(ids: string[], box: Box = BOX): Map<string, Point & { angle: number }> {
  const out = new Map<string, Point & { angle: number }>();
  ids.forEach((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
    out.set(id, { x: box.cx + box.radius * Math.cos(angle), y: box.cy + box.radius * Math.sin(angle), angle });
  });
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** √-scaled: 0 → lo, max → hi. */
export function sqrtScale(value: number, max: number, lo: number, hi: number): number {
  return max <= 0 ? lo : lo + (hi - lo) * Math.sqrt(Math.max(0, value) / max);
}

export function nodeRadius(events: number, max: number): number {
  return events <= 0 ? 3 : round(sqrtScale(events, max, 5, 16));
}

export function linkWidth(events: number, max: number): number {
  return round(sqrtScale(events, max, 1.25, 8));
}

/** Weak connections recede, so the main flows read first: √-scaled opacity. */
export function linkOpacity(events: number, max: number): number {
  return Math.round(sqrtScale(events, max, 0.28, 0.9) * 100) / 100;
}

export type Curve = { d: string; head: string; mid: Point };


/**
 * A curve from `a` to `b` that starts and stops `ra` / `rb` short of the centres (outside the
 * node discs), bending right of travel by `bend` × the chord, with an arrowhead of `size` at the end.
 */
export function curve(a: Point, b: Point, ra: number, rb: number, width: number, bend = 0.18): Curve {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // right of travel (SVG's y grows downwards): (-uy, ux)
  const c = { x: (a.x + b.x) / 2 - uy * len * bend, y: (a.y + b.y) / 2 + ux * len * bend };
  const toward = (p: Point, q: Point, by: number): Point => {
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + ((q.x - p.x) / l) * by, y: p.y + ((q.y - p.y) / l) * by };
  };
  const size = 5 + width * 1.2;
  const start = toward(a, c, ra + 3);
  const tip = toward(b, c, rb + 3);
  const base = toward(tip, c, size); // the arrow sits along the curve's final tangent
  const tx = tip.x - base.x, ty = tip.y - base.y;
  const tl = Math.hypot(tx, ty) || 1;
  const px = (-ty / tl) * size * 0.55, py = (tx / tl) * size * 0.55;
  const end = toward(tip, c, size * 0.8); // the line stops inside the arrowhead, not past its tip
  // the midpoint of a quadratic Bézier at t = 0.5
  const mid = { x: 0.25 * start.x + 0.5 * c.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * c.y + 0.25 * end.y };
  return {
    d: `M${round(start.x)} ${round(start.y)} Q${round(c.x)} ${round(c.y)} ${round(end.x)} ${round(end.y)}`,
    head: `M${round(tip.x)} ${round(tip.y)} L${round(base.x + px)} ${round(base.y + py)} L${round(base.x - px)} ${round(base.y - py)} Z`,
    mid: { x: round(mid.x), y: round(mid.y) },
  };
}

export type Laid = {
  box: Box;
  nodes: { id: string; x: number; y: number; angle: number; r: number; events: number }[];
  links: (Link & { width: number; opacity: number; curve: Curve })[];
  loops: Link[]; // an agent's tasks to itself: in the table, not drawn
};

export function layout(net: Network, box: Box = BOX): Laid {
  const ids = layoutOrder();
  const pos = positions(ids, box);
  const events = new Map(net.nodes.map((n) => [n.id, n.events]));
  const maxNode = Math.max(0, ...net.nodes.map((n) => n.events));
  const nodes = ids.map((id) => {
    const p = pos.get(id)!;
    const e = events.get(id) ?? 0;
    return { id, x: round(p.x), y: round(p.y), angle: p.angle, r: nodeRadius(e, maxNode), events: e };
  });
  const r = new Map(nodes.map((n) => [n.id, n]));
  const drawable = net.links.filter((l) => l.from !== l.to && r.has(l.from) && r.has(l.to));
  const maxLink = Math.max(0, ...drawable.map((l) => l.events));
  const links = drawable
    .map((l) => {
      const a = r.get(l.from)!, b = r.get(l.to)!;
      const width = linkWidth(l.events, maxLink);
      return { ...l, width, opacity: linkOpacity(l.events, maxLink), curve: curve(a, b, a.r, b.r, width) };
    })
    .sort((x, y) => x.events - y.events); // the heaviest are drawn last, on top
  return { box, nodes, links, loops: net.links.filter((l) => l.from === l.to) };
}
