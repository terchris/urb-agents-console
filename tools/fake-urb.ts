#!/usr/bin/env bun
// A stand-in for `urb events --since <x> --json` until the real one is released (#1651).
// Run the collector against it with URB_BIN=tools/fake-urb.ts.
//
//   FAKE_URB_FILE=<path>   print this file instead (a fixture)
//   FAKE_URB_FAIL=1        exit 1, as `urb` would when rate-limited
//
// Otherwise it prints a few events from the last minute in the shape urb 0.5.48 prints
// ({ schema, since, until, events }), including ids that are not on the allowlist, so the fold can
// be seen working.
const args = process.argv.slice(2);
if (args[0] !== "events" || !args.includes("--since") || !args.includes("--json")) {
  console.error("fake-urb: only `events --since <x> --json` is supported");
  process.exit(2);
}
if (process.env.FAKE_URB_FAIL === "1") {
  console.error("fake-urb: failing on purpose (FAKE_URB_FAIL=1)");
  process.exit(1);
}
if (process.env.FAKE_URB_FILE) {
  process.stdout.write(await Bun.file(process.env.FAKE_URB_FILE).text());
  process.exit(0);
}

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const agents = ["ops-dev", "marketing", "atlas", "imac", "tor-agent", "urb-agents-console", "terje", "rc-eval", "urbalurba"];
const kinds = ["opened", "moved", "replied", "closed"] as const;
const states = { opened: "submitted", moved: "working", replied: null, closed: "completed" } as const;

const events = Array.from({ length: 3 }, () => {
  const kind = pick(kinds);
  const from = pick(agents), to = pick(agents);
  const stamped = kind === "opened" || kind === "replied"; // a label move carries no speaker stamp
  return {
    id: crypto.randomUUID().replaceAll("-", "").slice(0, 24),
    at: new Date(Date.now() - Math.floor(Math.random() * 60_000)).toISOString().replace(/\.\d{3}Z$/, "Z"),
    kind, from, to,
    by: kind === "replied" ? pick([from, to]) : null,
    state: states[kind],
    provider: stamped ? "claude-code:cli" : null,
    model: stamped ? pick(["Opus 5.5 (1M context)", "Opus 5 (1M context)"]) : null,
  };
}).sort((a, b) => a.at.localeCompare(b.at));
const since = args[args.indexOf("--since") + 1];
console.log(JSON.stringify({ schema: "urb-events/1", since, until: new Date().toISOString(), events }, null, 2));

export {};
