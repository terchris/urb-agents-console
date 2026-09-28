// The collector: the only part of the console that touches the bus, and only through `urb`.
// One replica (manifests/collector.yaml). Every minute it runs `urb events --since <mark> --json`,
// keeps what src/event.ts lets in, and inserts the rows and moves the mark in one transaction.
// Once a day it deletes what is older than the retention period.
//
// `urb events --json` needs URB_EVENTS_KEY (the task ids are keyed hashes). It reaches `urb`
// through the environment; the collector never reads it.
//
// A bad run changes nothing: if `urb` fails or prints something that is not JSON, the mark stays
// where it was and the next tick asks for the same window again. The collector never exits over a
// bad run; the primary key makes asking twice harmless.
import { setNamed } from "./allowlist";
import { DIRECTORY_URL, fetchDirectory, sameList } from "./directory";
import { parseEvents } from "./event";
import { PgStore, type WritableStore } from "./store";

/** Runs `urb events --since <since> --json` and returns its stdout. Throws on failure. */
export type Urb = (since: string) => Promise<string>;

// Ask for 10 minutes before the mark: GitHub can report an event after later ones, and the
// overlap catches it. First run: the last 24 hours.
export const OVERLAP_MS = 10 * 60_000;
export const FIRST_WINDOW = "24h";

export function sinceArg(mark: Date | null): string {
  return mark ? new Date(mark.getTime() - OVERLAP_MS).toISOString() : FIRST_WINDOW;
}

export type Tick = { since: string; fetched: number; inserted: number; dropped: number; mark: string | null };

export async function collectOnce(store: WritableStore, urb: Urb, named: ReadonlySet<string>): Promise<Tick> {
  const old = await store.getMark();
  const since = sinceArg(old);
  const { events, dropped, until } = parseEvents(await urb(since), named);
  // The next mark is the moment the read covered up to (`until`), so a quiet hour does not widen
  // the next window. Without one, the newest event seen. The store never moves the mark backwards.
  const newest = until ?? events.reduce<Date | null>((m, e) => {
    const at = new Date(e.at);
    return !m || at > m ? at : m;
  }, null);
  const inserted = await store.collect(events, newest);
  const mark = newest && (!old || newest > old) ? newest : old;
  return { since, fetched: events.length + dropped, inserted, dropped, mark: mark?.toISOString() ?? null };
}

export function spawnUrb(bin: string, timeoutMs: number): Urb {
  return async (since) => {
    const proc = Bun.spawn([bin, "events", "--since", since, "--json"], {
      stdout: "pipe", stderr: "pipe", timeout: timeoutMs,
      env: { ...process.env }, // passed explicitly: Bun.spawn does not see process.env changed at runtime
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    if (code !== 0) throw new Error(`urb events exited ${code}${proc.signalCode ? ` (${proc.signalCode})` : ""}: ${err.trim().slice(0, 300)}`);
    return out;
  };
}

/** How often the collector re-reads marketing's list of who may be named. */
export const NAMING_EVERY_MS = 60 * 60_000;

export type Naming = { list: ReadonlySet<string>; changed: number; source: "marketing" | "saved" } | null;

/**
 * The list to fold with: marketing's, when it can be read (saved, and folding stored ids that left
 * it); otherwise the last one saved; otherwise null, and the caller must not collect.
 */
export async function refreshNaming(store: WritableStore, load: () => Promise<ReadonlySet<string>>): Promise<Naming> {
  try {
    const list = await load();
    const saved = await store.getNamed();
    const changed = saved && sameList(saved, list) ? 0 : await store.setNamed(list);
    return { list, changed, source: "marketing" };
  } catch {
    const saved = await store.getNamed();
    return saved ? { list: saved, changed: 0, source: "saved" } : null;
  }
}

export async function prune(store: WritableStore, retentionDays: number, now = new Date()): Promise<number> {
  return store.prune(new Date(now.getTime() - retentionDays * 86_400_000));
}

// One JSON line per thing that happened, for the cluster's log pipeline.
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));

async function main() {
  const store = PgStore.fromEnv();
  if (!store) {
    log({ level: "error", msg: "DATABASE_URL is not set; the collector has nowhere to write" });
    process.exit(1);
  }
  const every = Number(process.env.COLLECT_INTERVAL_SECONDS ?? 60) * 1000;
  const retentionDays = Number(process.env.RETENTION_DAYS ?? 90);
  const urb = spawnUrb(process.env.URB_BIN ?? "urb", Math.max(every - 5_000, 10_000));

  let stopping = false;
  let wake: (() => void) | null = null;
  const stop = () => {
    stopping = true;
    wake?.();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  log({ level: "info", msg: "collector started", everySeconds: every / 1000, retentionDays, naming: DIRECTORY_URL });
  let lastPrune = 0, lastNaming = 0;
  let named: ReadonlySet<string> | null = null;
  const load = async () => (await fetchDirectory()).named;
  while (!stopping) {
    if (!named || Date.now() - lastNaming > NAMING_EVERY_MS) {
      const n = await refreshNaming(store, load);
      if (n) {
        named = n.list;
        setNamed(n.list);
        lastNaming = Date.now();
        log({ level: n.source === "marketing" ? "info" : "warn", msg: "naming list", source: n.source, ids: n.list.size, refolded: n.changed });
      } else {
        log({ level: "error", msg: "no naming list: marketing's agents.json unreadable and none saved; not collecting", url: DIRECTORY_URL });
      }
    }
    if (named) {
      try {
        log({ level: "info", msg: "collected", ...(await collectOnce(store, urb, named)) });
      } catch (e) {
        log({ level: "error", msg: "collect failed; mark kept", error: String(e) });
      }
    }
    if (Date.now() - lastPrune > 86_400_000) {
      try {
        log({ level: "info", msg: "pruned", deleted: await prune(store, retentionDays), retentionDays });
        lastPrune = Date.now();
      } catch (e) {
        log({ level: "error", msg: "prune failed", error: String(e) });
      }
    }
    await new Promise<void>((r) => {
      wake = r;
      setTimeout(r, every);
    });
  }
  await store.sql.close();
  log({ level: "info", msg: "collector stopped" });
}

if (import.meta.main) await main();
