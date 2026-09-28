// The collector: the only part of the console that touches the bus, and only through `urb`.
// One replica (manifests/collector.yaml). Every minute it runs `urb events --since <mark> --json`,
// keeps what src/event.ts lets in, and inserts the rows and moves the mark in one transaction.
// Once a day it deletes what is older than the retention period.
//
// A bad run changes nothing: if `urb` fails or prints something that is not JSON, the mark stays
// where it was and the next tick asks for the same window again. The collector never exits over a
// bad run; the primary key makes asking twice harmless.
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

export async function collectOnce(store: WritableStore, urb: Urb): Promise<Tick> {
  const old = await store.getMark();
  const since = sinceArg(old);
  const { events, dropped } = parseEvents(await urb(since));
  // The newest event seen; the store keeps the later of this and the old mark.
  const newest = events.reduce<Date | null>((m, e) => {
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

  log({ level: "info", msg: "collector started", everySeconds: every / 1000, retentionDays });
  let lastPrune = 0;
  while (!stopping) {
    try {
      log({ level: "info", msg: "collected", ...(await collectOnce(store, urb)) });
    } catch (e) {
      log({ level: "error", msg: "collect failed; mark kept", error: String(e) });
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
