// One `urb events` row, and the one place a row from the bus is let in.
//
// The contract (terchris/urb-agents #1651) is publishable by construction, but this file does not
// rely on that. It names every field it keeps; a field it does not name is dropped, never stored,
// so a field added to `urb events` later goes nowhere until this code chooses it. Ids are folded
// through the allowlist here, before anything is written.
import { fold } from "./allowlist";

export const KINDS = ["opened", "moved", "replied", "closed"] as const;
export type Kind = (typeof KINDS)[number];

export type Event = {
  id: string;
  at: string; // ISO 8601, UTC
  kind: Kind;
  from: string; // an allowlisted id, or "others"
  to: string | null;
  state: string | null;
  provider: string | null;
  model: string | null;
};

// The public field list, in order. The API test checks that no response carries anything else.
export const EVENT_FIELDS = ["id", "at", "kind", "from", "to", "state", "provider", "model"] as const;

// Shapes the free-text fields may take. Anything else is not stored: a value that fails is
// null (or, for a required field, the row is dropped), so an unexpected string can never be
// smuggled onto the public page through a field that looks harmless.
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const AGENT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STATE = /^[a-z][a-z-]{0,31}$/;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/;

function str(v: unknown, re: RegExp): string | null {
  return typeof v === "string" && re.test(v) ? v : null;
}

export function parseEvent(raw: unknown): Event | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const id = str(r.id, ID);
  const kind = KINDS.find((k) => k === r.kind);
  const from = str(r.from, AGENT);
  const at = typeof r.at === "string" ? new Date(r.at) : null;
  if (!id || !kind || !from || !at || Number.isNaN(at.getTime())) return null;

  const to = str(r.to, AGENT);
  return {
    id,
    at: at.toISOString(),
    kind,
    from: fold(from),
    to: to === null ? null : fold(to),
    state: str(r.state, STATE),
    provider: str(r.provider, LABEL),
    model: str(r.model, LABEL),
  };
}

// `urb events --json` output: a JSON array, or one object per line — the contract does not say
// which yet (question 1 on #1651), so both are read. Returns the rows kept and how many were not.
export function parseEvents(text: string): { events: Event[]; dropped: number } {
  const t = text.trim();
  if (t === "") return { events: [], dropped: 0 };
  const raws: unknown[] = t.startsWith("[")
    ? (JSON.parse(t) as unknown[])
    : t.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as unknown);
  const events: Event[] = [];
  for (const raw of raws) {
    const e = parseEvent(raw);
    if (e) events.push(e);
  }
  return { events, dropped: raws.length - events.length };
}
