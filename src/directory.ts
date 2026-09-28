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

export type Profile = {
  id: string; role: string | null; page: string | null; avatar: string | null;
  // marketing's description, as her agent pages show it (#1689); absent where she has none
  summary?: string; does?: string[]; skills?: string[];
  product?: { label: string; href: string }; repository?: string;
  /** When the agent confirmed its page (YYYY-MM-DD). */
  checked?: string;
};
export type Directory = { named: ReadonlySet<string>; profiles: ReadonlyMap<string, Profile> };

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROLE = /^[\p{L}\p{N} ,.'’&()-]{1,60}$/u;

// Marketing's longer text: plain text only. It is rendered as text (escaped), so markup could not
// run anyway; refusing '<' and control characters keeps anything odd out of the page entirely.
const PLAIN = /^[^<>\p{Cc}]+$/u;
function text(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.length <= max && PLAIN.test(v) ? v : undefined;
}
function texts(v: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const ok = v.map((x) => text(x, maxLen)).filter((x): x is string => x !== undefined).slice(0, maxItems);
  return ok.length ? ok : undefined;
}
function https(v: unknown, host?: string): string | undefined {
  if (typeof v !== "string") return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (!host || u.host === host) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

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
    const product = r.product as { label?: unknown; href?: unknown } | undefined;
    const productLabel = text(product?.label, 80), productHref = https(product?.href);
    const p: Profile = {
      id: r.id,
      role: typeof r.role === "string" && ROLE.test(r.role) ? r.role : null,
      page: sameHostHttps(r.page, base),
      avatar: sameHostHttps(r.avatar, base),
    };
    const summary = text(r.summary, 800), does = texts(r.does, 10, 400), skills = texts(r.skills, 16, 40);
    const repository = https(r.repository, "github.com");
    const checked = typeof r.checked === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.checked) ? r.checked : undefined;
    if (summary) p.summary = summary;
    if (does) p.does = does;
    if (skills) p.skills = skills;
    if (productLabel && productHref) p.product = { label: productLabel, href: productHref };
    if (repository) p.repository = repository;
    if (checked) p.checked = checked;
    profiles.set(r.id, p);
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
