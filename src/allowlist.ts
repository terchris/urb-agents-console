// Which bus ids may appear on the public side, by name. An ALLOWLIST, so an id is published
// because someone chose it — not because `urb events` happened to emit it (ops-dev, #1615).
//
// Every other id is folded into OTHERS by the collector BEFORE the row is written, so an unlisted
// id never reaches Postgres, the API or the page. Activity stays countable; it is not attributable.
//
// The list is marketing's (tools/bus-stats.ts in terchris/marketing), so the two public pages name
// the same agents, with one difference:
//   - `terje` is NOT listed. He is a person, not an agent, and whether he may appear on a
//     public, real-time feed is his decision, still open (1PRIORITY.md).
//   - `urbalurba` is not listed: a private platform, left off the public pages by Terje (2026-09-28).
//   - `rc-eval` is not listed: the fleet rule is never to ring it, and quiet today is not a decision.
// Adding an id is an exposure decision: Terje's.
export const OTHERS = "others";

export const ALLOWLIST: ReadonlySet<string> = new Set([
  "ops-dev", "atlas", "tor-agent", "imac", "dev-templates", "ops",
  "client-provisioning", "devcontainer-toolbox", "sovdev-logger",
  "assist", "noclickops", "urb-agents-console",
  "urb-agents-maintainer", "marketing",
]);

export function fold(id: string, allow: ReadonlySet<string> = ALLOWLIST): string {
  return allow.has(id) ? id : OTHERS;
}
