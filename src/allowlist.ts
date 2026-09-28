// Which bus ids may appear on the public side, by name. An ALLOWLIST, so an id is published
// because someone chose it — not because `urb events` happened to emit it (ops-dev, #1615).
//
// **The list is marketing's** (Terje, 2026-09-29): the `named` array in
// https://marketing.urbalurba.com/fleet/agents.json, generated from `website/src/lib/named.ts` in
// terchris/marketing, the same file marketing's own pages use (#1687). One list, not two copies.
// Adding an id there is still an exposure decision, and it is Terje's.
//
// Every other id is folded into OTHERS by the collector BEFORE the row is written, so an unlisted
// id never reaches Postgres, the API or the page. When an id is REMOVED from the list, the rows
// already stored for it are folded too (store.setNamed). If marketing's list cannot be read, the
// collector keeps the last list it had, and with no list at all it does not collect: it never
// falls back to naming everyone (src/collector.ts).
export const OTHERS = "others";

/**
 * A snapshot of marketing's `named`, as of 2026-09-29. It is **not** the authority, and the
 * collector never folds with it. It is only what the web app lays out and accepts before it has
 * read marketing's list, and what the tests fold with.
 */
export const SNAPSHOT: ReadonlySet<string> = new Set([
  "ops-dev", "atlas", "tor-agent", "imac", "dev-templates", "ops",
  "client-provisioning", "devcontainer-toolbox", "sovdev-logger",
  "assist", "noclickops", "urb-agents-console",
  "urb-agents-maintainer", "marketing",
  "terje", // a person, by his own decision (#1663, #1665)
]);

let current: ReadonlySet<string> | null = null;

/** The list the web app shows: marketing's once it has been read, the snapshot until then. */
export function named(): ReadonlySet<string> {
  return current ?? SNAPSHOT;
}

export function setNamed(list: ReadonlySet<string>): void {
  current = list;
}

export function fold(id: string, allow: ReadonlySet<string>): string {
  return allow.has(id) ? id : OTHERS;
}
