// Marketing's public agent list (#1687): who may be named, and for the agents with a page, their
// role, page and avatar. https://marketing.urbalurba.com/fleet/agents.json, schema
// "marketing-agents/1". Marketing stays the source of what is said about an agent; the console
// links to it and shows the avatar, loaded from marketing's site, never copied.
//
// Everything in the file is checked before it is used, as a bus row is: ids have the shape of a
// bus id, the role is short plain text, and a page or avatar URL must be https on the same host as
// the list itself, or it is dropped.
export const DIRECTORY_URL = process.env.DIRECTORY_URL ?? "https://marketing.urbalurba.com/fleet/agents.json";
export const DIRECTORY_SCHEMA = "marketing-agents/1";

export type Profile = { id: string; role: string | null; page: string | null; avatar: string | null };
export type Directory = { named: ReadonlySet<string>; profiles: ReadonlyMap<string, Profile> };

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROLE = /^[\p{L}\p{N} ,.'’&()-]{1,60}$/u;

function sameHostHttps(v: unknown, base: string): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v), b = new URL(base);
    return u.protocol === "https:" && u.host === b.host ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Throws unless it is the schema, with a `named` list of ids. */
export function parseDirectory(raw: unknown, base = DIRECTORY_URL): Directory {
  const d = raw as { schema?: unknown; named?: unknown; agents?: unknown };
  if (typeof d !== "object" || d === null) throw new Error("agents.json: not an object");
  if (d.schema !== DIRECTORY_SCHEMA) throw new Error(`agents.json: schema ${JSON.stringify(d.schema)}, expected ${DIRECTORY_SCHEMA}`);
  if (!Array.isArray(d.named)) throw new Error("agents.json: no named list");
  const named = new Set(d.named.filter((x): x is string => typeof x === "string" && ID.test(x)));
  const profiles = new Map<string, Profile>();
  for (const a of Array.isArray(d.agents) ? d.agents : []) {
    const r = a as Record<string, unknown>;
    if (typeof r.id !== "string" || !named.has(r.id)) continue; // a profile is only for a named id
    profiles.set(r.id, {
      id: r.id,
      role: typeof r.role === "string" && ROLE.test(r.role) ? r.role : null,
      page: sameHostHttps(r.page, base),
      avatar: sameHostHttps(r.avatar, base),
    });
  }
  return { named, profiles };
}

export async function fetchDirectory(url = DIRECTORY_URL, timeoutMs = 10_000): Promise<Directory> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`agents.json: HTTP ${r.status}`);
  return parseDirectory(await r.json(), url);
}

export function sameList(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/**
 * The web app's copy of marketing's list, refreshed in the background (never on a visitor's
 * request). Until the first read it is empty: no avatars, and the snapshot names the layout.
 */
export class DirectoryCache {
  current: Directory | null = null;
  constructor(private load: () => Promise<Directory> = () => fetchDirectory()) {}

  async refresh(onChange?: (d: Directory) => void): Promise<boolean> {
    try {
      this.current = await this.load();
      onChange?.(this.current);
      return true;
    } catch {
      return false; // keep what we had
    }
  }

  profiles(): ReadonlyMap<string, Profile> {
    return this.current?.profiles ?? new Map();
  }
}
