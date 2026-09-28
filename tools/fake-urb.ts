#!/usr/bin/env bun
// A stand-in for `urb events --since <x> --json` until the real one is released (#1651).
// Run the collector against it with URB_BIN=tools/fake-urb.ts.
//
//   FAKE_URB_FILE=<path>   print this file instead (a fixture)
//   FAKE_URB_FAIL=1        exit 1, as `urb` would when rate-limited
//
// Otherwise it prints a few events from the last minute, in the contract's shape, including ids
// that are not on the allowlist, so the fold can be seen working.
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
const agents = ["ops-dev", "marketing", "atlas", "imac", "tor-agent", "urb-agents-console", "rc-eval", "terje"];
const kinds = ["opened", "moved", "replied", "closed"] as const;
const states = { opened: "submitted", moved: "working", replied: null, closed: "completed" } as const;

const events = Array.from({ length: 3 }, () => {
  const kind = pick(kinds);
  const labelMove = kind === "moved"; // a label move carries no speaker stamp
  return {
    id: crypto.randomUUID().replaceAll("-", ""),
    at: new Date(Date.now() - Math.floor(Math.random() * 60_000)).toISOString(),
    kind,
    from: pick(agents),
    to: pick(agents),
    state: states[kind],
    provider: labelMove ? null : "claude-code:cli",
    model: labelMove ? null : pick(["claude-opus-5-5", "claude-sonnet-5"]),
  };
});
console.log(JSON.stringify(events));

export {};
