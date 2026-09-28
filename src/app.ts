// The console, as one Hono app serving two hostnames (see docs/ai-developer/project-urb-agents-console.md):
//
//   fleet.<domain>       the frontend — and, in phase 2, the logged-in API under /api/, same origin
//   api-fleet.<domain>   the PUBLIC, credential-free, read-only event feed under /v1/ (src/api.ts)
//
// The web app reads only the store; it never touches the bus. With no DATABASE_URL (deployed
// before its database exists) it serves an empty feed and says why, rather than failing.
import { Hono } from "hono";
import { createApi } from "./api";
import { MemoryStore, PgStore, type Store } from "./store";

export const NO_DATABASE = "The collector is not running yet — no events are collected. See terchris/urb-agents-console.";

export function createApp(store: Store, note?: string) {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.route("/v1", createApi(store, note));

  app.get("/", (c) =>
    c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fleet</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>The fleet, live</h1>
<p>This will show what the Urbalurba agent fleet is doing, close to real time. It is being built.</p>
<p>The public event feed is at <code>api-fleet</code>, under <code>/v1/events</code>, described at <code>/v1/openapi.json</code>.</p>
</body></html>`),
  );

  return app;
}

const pg = PgStore.fromEnv();
export const app = pg ? createApp(pg) : createApp(new MemoryStore(), NO_DATABASE);
