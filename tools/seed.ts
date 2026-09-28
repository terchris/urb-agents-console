#!/usr/bin/env bun
// Fills a LOCAL database with a few days of made-up bus traffic, so the page can be built and
// looked at before `urb events` exists. Synthetic by design: nothing from the real bus, so nothing
// here needs clearing before it's committed to a public repository.
//
//   DATABASE_URL=postgres://… bun tools/seed.ts [days=3]
//
// Each task is a conversation, as on the real bus: opened → moved to working → a reply or two →
// moved to done → closed by the sender. Busier in the working day than at night. Goes through
// parseEvent, like the collector, folded with the snapshot of marketing's list (rc-eval becomes others).
import { SNAPSHOT } from "../src/allowlist";
import { parseEvent, type Event } from "../src/event";
import { PgStore } from "../src/store";

const store = PgStore.fromEnv();
if (!store) {
  console.error("seed: set DATABASE_URL to a local database");
  process.exit(1);
}
const days = Number(process.argv[2] ?? 3);

// A small deterministic generator, so a re-seed makes the same history.
let state = 42;
const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

const pairs: [string, string][] = [
  ["ops-dev", "imac"], ["ops-dev", "tor-agent"], ["ops-dev", "marketing"], ["ops-dev", "urb-agents-console"],
  ["urb-agents-maintainer", "ops-dev"], ["urb-agents-maintainer", "urb-agents-console"],
  ["atlas", "tor-agent"], ["marketing", "ops-dev"], ["tor-agent", "imac"], ["ops", "ops-dev"],
  ["urb-agents-console", "urb-agents-maintainer"], ["dev-templates", "tor-agent"], ["sovdev-logger", "ops"],
  ["rc-eval", "ops-dev"], ["terje", "ops-dev"], ["ops-dev", "terje"],
];
const models = ["Opus 5.5 (1M context)", "Opus 5.5 (1M context)", "Opus 5 (1M context)", "Sonnet 5"];
const providers = ["claude-code:cli", "claude-code:cli", "claude-code:claude-desktop"];

const now = Date.now();
const raws: Record<string, unknown>[] = [];
let n = 0;
// As on the real bus, `from` and `to` are always the task's; `by` is set on replies only, and
// most events carry no provider or model (ops-dev measured 39 of 61 null, #1665).
const push = (at: number, kind: string, from: string, to: string, st: string | null, by: string | null) => {
  if (at > now) return;
  const stamped = (kind === "opened" || kind === "replied") && rand() < 0.5;
  raws.push({
    id: `seed${(n++).toString(16).padStart(6, "0")}`,
    at: new Date(at).toISOString(), kind, from, to, by, state: st,
    provider: stamped ? pick(providers) : null, model: stamped ? pick(models) : null,
  });
};

for (let t = now - days * 86_400_000; t < now; ) {
  const hour = new Date(t).getUTCHours();
  const busy = hour >= 6 && hour <= 21;
  t += (busy ? 10 : 45) * 60_000 * (0.3 + rand() * 1.4); // a new task every ten minutes or so by day
  const [from, to] = pick(pairs);
  let at = t;
  const step = (min: number) => (at += min * 60_000 * (0.5 + rand()));
  push(at, "opened", from, to, "submitted", null);
  step(3); push(at, "moved", from, to, "working", null);
  for (let r = 0; r < 1 + Math.floor(rand() * 3); r++) {
    step(8); push(at, "replied", from, to, null, r % 2 ? from : to);
  }
  const ending = rand();
  step(6);
  if (ending < 0.12) { push(at, "moved", from, to, "input-required", null); continue; }
  push(at, "moved", from, to, "done", null);
  if (ending < 0.8) { step(10); push(at, "closed", from, to, "completed", null); }
}

const events = raws.map((r) => parseEvent(r, SNAPSHOT)).filter((e): e is Event => e !== null);
let inserted = 0;
for (let i = 0; i < events.length; i += 500) inserted += await store.collect(events.slice(i, i + 500), null);
console.log(`seed: ${events.length} events over ${days} days, ${inserted} new`);
await store.sql.close();
