// Which bus ids may appear on the public side, by name. An ALLOWLIST, so an id is published
// because someone chose it — not because `urb events` happened to emit it (ops-dev, #1615).
//
// Every other id is folded into OTHERS by the collector BEFORE the row is written, so an unlisted
// id never reaches Postgres, the API or the page. Activity stays countable; it is not attributable.
//
// The list is marketing's (tools/bus-stats.ts in terchris/marketing), so the two public pages name
// the same agents:
//   - `terje` IS listed, by name. He is a person, not an agent; he decided it himself (#1663,
//     2026-09-28: "Im fine with that. use my name"). That consent is his alone: any other person's
//     id is a fresh question for Terje, never an addition here.
//   - `urbalurba` is not listed: a private platform, left off the public pages by Terje (2026-09-28).
//   - `rc-eval` is not listed: the fleet rule is never to ring it, and quiet today is not a decision.
// Adding an id is an exposure decision: Terje's.
export const OTHERS = "others";

export const ALLOWLIST: ReadonlySet<string> = new Set([
  "ops-dev", "atlas", "tor-agent", "imac", "dev-templates", "ops",
  "client-provisioning", "devcontainer-toolbox", "sovdev-logger",
  "assist", "noclickops", "urb-agents-console",
  "urb-agents-maintainer", "marketing",
  "terje", // a person, by his own decision (#1663, #1665)
]);

export function fold(id: string, allow: ReadonlySet<string> = ALLOWLIST): string {
  return allow.has(id) ? id : OTHERS;
}
