// One `urb events` row, and the one place a row from the bus is let in.
//
// The contract is `urb events --json` (urb 0.5.48, schema "urb-events/1"): an object
// { schema, since, until, events: [...] }. In each event, `from` and `to` are the TASK's sender
// and recipient, whatever the event; `by` is who acted, and is set only where the bus records it
// (a reply). The ids of agents are plaintext: only the task id is a keyed hash, so this allowlist
// is the only thing that decides who is shown (ops-dev, #1665).
//
// The contract is publishable by construction, but this file does not
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
  from: string; // the task's sender: an allowlisted id, or "others"
  to: string | null; // the task's recipient
  by: string | null; // who acted, where the bus says (a reply); null otherwise
  state: string | null;
  provider: string | null;
  model: string | null;
};

// The public field list, in order. The API test checks that no response carries anything else.
export const EVENT_FIELDS = ["id", "at", "kind", "from", "to", "by", "state", "provider", "model"] as const;
export const SCHEMA = "urb-events/1" as const;

// Shapes the free-text fields may take. Anything else is not stored: a value that fails is
// null (or, for a required field, the row is dropped), so an unexpected string can never be
// smuggled onto the public page through a field that looks harmless.
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const AGENT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STATE = /^[a-z][a-z-]{0,31}$/;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._:/@+()-]{0,99}$/; // "claude-code:cli", "Opus 5 (1M context)"

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
  const by = str(r.by, AGENT);
  return {
    id,
    at: at.toISOString(),
    kind,
    from: fold(from),
    to: to === null ? null : fold(to),
    by: by === null ? null : fold(by),
    state: str(r.state, STATE),
    provider: str(r.provider, LABEL),
    model: str(r.model, LABEL),
  };
}

// `urb events --json` output: { schema, since, until, events }. `until` is the moment the read
// covered up to, which is the collector's next mark. A different schema is refused whole, so a
// changed contract is never half-read.
export function parseEvents(text: string): { events: Event[]; dropped: number; until: Date | null } {
  const doc = JSON.parse(text) as { schema?: unknown; until?: unknown; events?: unknown };
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) throw new Error("urb events: not an object");
  if (doc.schema !== SCHEMA) throw new Error(`urb events: schema ${JSON.stringify(doc.schema)}, expected ${SCHEMA}`);
  if (!Array.isArray(doc.events)) throw new Error("urb events: no events array");
  const until = typeof doc.until === "string" ? new Date(doc.until) : null;
  const raws: unknown[] = doc.events;
  const events: Event[] = [];
  for (const raw of raws) {
    const e = parseEvent(raw);
    if (e) events.push(e);
  }
  return { events, dropped: raws.length - events.length, until: until && !Number.isNaN(until.getTime()) ? until : null };
}
