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

// The network over a window: one link per ordered pair (the task's sender → its recipient), and
// how many events each agent took part in, in any role.
export type Link = { from: string; to: string; events: number; opened: number; replies: number };
export type Node = { id: string; events: number };
export type Network = { nodes: Node[]; links: Link[] };

export type ReadOpts = { before?: Cursor; limit: number; agent?: string };

// Events counted into fixed-size time buckets from `origin`: the fleet's total per bucket, and each
// agent's involvement (as sender, recipient or replier; an event counts once per agent).
export type ActivityOpts = { origin: number; size: number; count: number };
export type Activity = { total: number[]; agents: { id: string; counts: number[]; events: number }[] };

export interface Store {
  /** Newest first, strictly older than `before`, and only events `agent` took part in, when given. */
  readEvents(opts: ReadOpts): Promise<Event[]>;
  /** Who sent work to whom, and how much, at or after `since`. */
  network(since: Date): Promise<Network>;
  /** Events per time bucket, for the fleet and for each agent. */
  activity(opts: ActivityOpts): Promise<Activity>;
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

  async readEvents({ before, limit, agent }: ReadOpts): Promise<Event[]> {
    const sql = this.sql;
    const older = !before
      ? sql`true`
      : before.id === null
        ? sql`at < ${before.at}`
        : sql`(at, id) < (${before.at}::timestamptz, ${before.id})`;
    const who = agent === undefined ? sql`true` : sql`(from_id = ${agent} OR to_id = ${agent} OR by_id = ${agent})`;
    const rows = await sql`
      SELECT id, at, kind, from_id, to_id, by_id, state, provider, model
      FROM events WHERE ${older} AND ${who}
      ORDER BY at DESC, id DESC
      LIMIT ${limit}`;
    return rows.map(toEvent);
  }

  async activity({ origin, size, count }: ActivityOpts): Promise<Activity> {
    const sql = this.sql;
    const from = new Date(origin), until = new Date(origin + size * count);
    // bucket index = floor((epoch ms - origin) / size), computed in Postgres so only counts travel
    const b = sql`floor((extract(epoch FROM at) * 1000 - ${origin}) / ${size})::int`;
    const [total, per] = await Promise.all([
      sql`SELECT ${b} AS b, count(*)::int AS n FROM events WHERE at >= ${from} AND at < ${until} GROUP BY 1`,
      sql`
        SELECT agent, b, count(DISTINCT id)::int AS n FROM (
          SELECT id, from_id AS agent, ${b} AS b FROM events WHERE at >= ${from} AND at < ${until}
          UNION ALL SELECT id, to_id, ${b} FROM events WHERE at >= ${from} AND at < ${until} AND to_id IS NOT NULL
          UNION ALL SELECT id, by_id, ${b} FROM events WHERE at >= ${from} AND at < ${until} AND by_id IS NOT NULL
        ) roles GROUP BY agent, b`,
    ]);
    return shapeActivity(count, total as { b: number; n: number }[], per as { agent: string; b: number; n: number }[]);
  }

  async network(since: Date): Promise<Network> {
    const sql = this.sql;
    const [links, nodes] = await Promise.all([
      sql`
        SELECT from_id, to_id, count(*)::int AS events,
               count(*) FILTER (WHERE kind = 'opened')::int  AS opened,
               count(*) FILTER (WHERE kind = 'replied')::int AS replies
        FROM events WHERE at >= ${since} AND to_id IS NOT NULL
        GROUP BY from_id, to_id
        ORDER BY count(*) DESC, from_id COLLATE "C", to_id COLLATE "C"`,
      sql`
        SELECT agent, count(DISTINCT id)::int AS events FROM (
          SELECT id, from_id AS agent FROM events WHERE at >= ${since}
          UNION ALL SELECT id, to_id FROM events WHERE at >= ${since} AND to_id IS NOT NULL
          UNION ALL SELECT id, by_id FROM events WHERE at >= ${since} AND by_id IS NOT NULL
        ) roles GROUP BY agent ORDER BY count(DISTINCT id) DESC, agent COLLATE "C"`,
    ]);
    return {
      links: links.map((r: Record<string, unknown>) => ({
        from: r.from_id as string, to: r.to_id as string,
        events: r.events as number, opened: r.opened as number, replies: r.replies as number,
      })),
      nodes: nodes.map((r: Record<string, unknown>) => ({ id: r.agent as string, events: r.events as number })),
    };
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

function shapeActivity(count: number, total: { b: number; n: number }[], per: { agent: string; b: number; n: number }[]): Activity {
  const t = Array<number>(count).fill(0);
  for (const r of total) if (r.b >= 0 && r.b < count) t[r.b] = r.n;
  const by = new Map<string, number[]>();
  for (const r of per) {
    if (r.b < 0 || r.b >= count) continue;
    const c = by.get(r.agent) ?? Array<number>(count).fill(0);
    c[r.b] = r.n;
    by.set(r.agent, c);
  }
  const agents = [...by].map(([id, counts]) => ({ id, counts, events: counts.reduce((a, n) => a + n, 0) }));
  // busiest first; ties by id, in byte order
  agents.sort((a, b) => b.events - a.events || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { total: t, agents };
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

  async readEvents({ before, limit, agent }: ReadOpts): Promise<Event[]> {
    return this.sorted()
      .filter((e) => !before || e.at < before.at || (before.id !== null && e.at === before.at && e.id < before.id))
      .filter((e) => agent === undefined || e.from === agent || e.to === agent || e.by === agent)
      .slice(0, limit);
  }

  async activity({ origin, size, count }: ActivityOpts): Promise<Activity> {
    const total = new Map<number, number>();
    const per = new Map<string, { agent: string; b: number; n: number }>();
    for (const e of this.events) {
      const b = Math.floor((Date.parse(e.at) - origin) / size);
      if (b < 0 || b >= count) continue;
      total.set(b, (total.get(b) ?? 0) + 1);
      for (const agent of new Set([e.from, e.to, e.by].filter((x): x is string => x !== null))) {
        const k = `${agent}\u0000${b}`;
        const r = per.get(k) ?? { agent, b, n: 0 };
        r.n++;
        per.set(k, r);
      }
    }
    return shapeActivity(count, [...total].map(([b, n]) => ({ b, n })), [...per.values()]);
  }

  async network(since: Date): Promise<Network> {
    const links = new Map<string, Link>();
    const involved = new Map<string, Set<string>>();
    const touch = (agent: string, id: string) => involved.set(agent, (involved.get(agent) ?? new Set()).add(id));
    for (const e of this.events) {
      if (e.at < since.toISOString()) continue;
      touch(e.from, e.id);
      if (e.to !== null) touch(e.to, e.id);
      if (e.by !== null) touch(e.by, e.id);
      if (e.to === null) continue;
      const k = `${e.from}\u0000${e.to}`;
      const l = links.get(k) ?? { from: e.from, to: e.to, events: 0, opened: 0, replies: 0 };
      l.events++;
      if (e.kind === "opened") l.opened++;
      if (e.kind === "replied") l.replies++;
      links.set(k, l);
    }
    return {
      links: [...links.values()].sort((a, b) => b.events - a.events || cmp(a.from, b.from) || cmp(a.to, b.to)),
      nodes: [...involved].map(([id, s]) => ({ id, events: s.size })).sort((a, b) => b.events - a.events || cmp(a.id, b.id)),
    };
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
