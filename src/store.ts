// Where events live. Two implementations of one interface: Postgres (Bun.sql, Bun's built-in
// client, no driver dependency) for the cluster, and memory for tests and for a web app that has
// no database yet. The web app only ever calls the read half; only the collector writes.
import { SQL } from "bun";
import type { Event, Kind } from "./event";

export type Cursor = { at: string; id: string | null };

// What can honestly be attributed to an agent: `from` opened the task, `to` received it, and `by`
// wrote a reply. A move or a close carries no actor in the contract, so it counts only towards
// when an agent was last seen (as the task's sender or recipient), never as something it did.
export type AgentSummary = {
  id: string;
  opened: number; // tasks it opened
  received: number; // tasks opened to it
  replied: number; // replies it wrote
  lastSeen: string; // the latest event it took part in, in any role
};

export interface Store {
  /** Newest first, strictly older than `before` when given. */
  readEvents(opts: { before?: Cursor; limit: number }): Promise<Event[]>;
  /** Per id, from events at or after `since`. */
  agents(since: Date): Promise<AgentSummary[]>;
  /** How many events at or after `since`. */
  count(since: Date): Promise<number>;
}

export interface WritableStore extends Store {
  /** Insert the rows the store has not seen (by id) and move the mark, atomically. Returns the number inserted. */
  collect(events: Event[], mark: Date | null): Promise<number>;
  getMark(): Promise<Date | null>;
  /** Delete events older than `before`. Returns the number deleted. */
  prune(before: Date): Promise<number>;
}

const MARK = "events";

export class PgStore implements WritableStore {
  constructor(readonly sql: SQL) {}

  static fromEnv(url = process.env.DATABASE_URL): PgStore | null {
    return url ? new PgStore(new SQL(url)) : null;
  }

  async readEvents({ before, limit }: { before?: Cursor; limit: number }): Promise<Event[]> {
    const sql = this.sql;
    const where = !before
      ? sql``
      : before.id === null
        ? sql`WHERE at < ${before.at}`
        : sql`WHERE (at, id) < (${before.at}::timestamptz, ${before.id})`;
    const rows = await sql`
      SELECT id, at, kind, from_id, to_id, by_id, state, provider, model
      FROM events ${where}
      ORDER BY at DESC, id DESC
      LIMIT ${limit}`;
    return rows.map(toEvent);
  }

  async agents(since: Date): Promise<AgentSummary[]> {
    const rows = await this.sql`
      WITH roles AS (
        SELECT from_id AS agent, 'from' AS role, kind, at FROM events WHERE at >= ${since}
        UNION ALL
        SELECT to_id, 'to', kind, at FROM events WHERE at >= ${since} AND to_id IS NOT NULL
        UNION ALL
        SELECT by_id, 'by', kind, at FROM events WHERE at >= ${since} AND by_id IS NOT NULL
      )
      SELECT agent,
             count(*) FILTER (WHERE role = 'from' AND kind = 'opened')::int AS opened,
             count(*) FILTER (WHERE role = 'to' AND kind = 'opened')::int   AS received,
             count(*) FILTER (WHERE role = 'by' AND kind = 'replied')::int  AS replied,
             max(at) AS last_seen
      FROM roles GROUP BY agent ORDER BY max(at) DESC, agent COLLATE "C"`;
    return rows.map((r: Record<string, unknown>) => ({
      id: r.agent as string,
      opened: r.opened as number,
      received: r.received as number,
      replied: r.replied as number,
      lastSeen: (r.last_seen as Date).toISOString(),
    }));
  }

  async count(since: Date): Promise<number> {
    const [row] = await this.sql`SELECT count(*)::int AS n FROM events WHERE at >= ${since}`;
    return row.n as number;
  }

  async collect(events: Event[], mark: Date | null): Promise<number> {
    return this.sql.begin(async (tx) => {
      let inserted = 0;
      if (events.length > 0) {
        const rows = events.map((e) => ({
          id: e.id, at: e.at, kind: e.kind, from_id: e.from, to_id: e.to, by_id: e.by,
          state: e.state, provider: e.provider, model: e.model,
        }));
        const done = await tx`INSERT INTO events ${tx(rows)} ON CONFLICT (id) DO NOTHING RETURNING id`;
        inserted = done.length;
      }
      if (mark) {
        await tx`
          INSERT INTO collector_mark (name, since, ran) VALUES (${MARK}, ${mark}, now())
          ON CONFLICT (name) DO UPDATE SET since = greatest(collector_mark.since, excluded.since), ran = now()`;
      }
      return inserted;
    });
  }

  async getMark(): Promise<Date | null> {
    const [row] = await this.sql`SELECT since FROM collector_mark WHERE name = ${MARK}`;
    return row ? (row.since as Date) : null;
  }

  async prune(before: Date): Promise<number> {
    const rows = await this.sql`DELETE FROM events WHERE at < ${before} RETURNING id`;
    return rows.length;
  }
}

function toEvent(r: Record<string, unknown>): Event {
  return {
    id: r.id as string,
    at: (r.at as Date).toISOString(),
    kind: r.kind as Kind,
    from: r.from_id as string,
    to: (r.to_id as string | null) ?? null,
    by: (r.by_id as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    provider: (r.provider as string | null) ?? null,
    model: (r.model as string | null) ?? null,
  };
}

// The same behaviour in memory: tests, and a web app deployed before its database exists.
export class MemoryStore implements WritableStore {
  events: Event[] = [];
  mark: Date | null = null;

  async readEvents({ before, limit }: { before?: Cursor; limit: number }): Promise<Event[]> {
    return this.sorted()
      .filter((e) => !before || e.at < before.at || (before.id !== null && e.at === before.at && e.id < before.id))
      .slice(0, limit);
  }

  async agents(since: Date): Promise<AgentSummary[]> {
    const by = new Map<string, AgentSummary>();
    const get = (id: string, at: string) => {
      const a = by.get(id) ?? { id, opened: 0, received: 0, replied: 0, lastSeen: at };
      if (at > a.lastSeen) a.lastSeen = at;
      by.set(id, a);
      return a;
    };
    for (const e of this.events) {
      if (e.at < since.toISOString()) continue;
      const from = get(e.from, e.at);
      if (e.kind === "opened") from.opened++;
      if (e.to !== null) {
        const to = get(e.to, e.at);
        if (e.kind === "opened") to.received++;
      }
      if (e.by !== null) {
        const actor = get(e.by, e.at);
        if (e.kind === "replied") actor.replied++;
      }
    }
    return [...by.values()].sort((a, b) => cmp(b.lastSeen, a.lastSeen) || cmp(a.id, b.id));
  }

  async count(since: Date): Promise<number> {
    return this.events.filter((e) => e.at >= since.toISOString()).length;
  }

  async collect(events: Event[], mark: Date | null): Promise<number> {
    const seen = new Set(this.events.map((e) => e.id));
    const fresh = events.filter((e) => !seen.has(e.id) && seen.add(e.id));
    this.events.push(...fresh);
    if (mark && (!this.mark || mark > this.mark)) this.mark = mark;
    return fresh.length;
  }

  async getMark(): Promise<Date | null> {
    return this.mark;
  }

  async prune(before: Date): Promise<number> {
    const n = this.events.length;
    this.events = this.events.filter((e) => e.at >= before.toISOString());
    return n - this.events.length;
  }

  private sorted(): Event[] {
    return [...this.events].sort((a, b) => cmp(b.at, a.at) || cmp(b.id, a.id));
  }
}

// Byte order, as Postgres compares `id COLLATE "C"`.
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
