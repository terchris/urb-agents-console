// The console, as one Hono app serving two hostnames (see docs/ai-developer/project-urb-agents-console.md):
//
//   fleet.<domain>       the frontend — and, in phase 2, the logged-in API under /api/, same origin
//   api-fleet.<domain>   the PUBLIC, credential-free, read-only event feed under /v1/
//
// This is the skeleton the agent starts from: it proves the image, the ArgoCD registration and
// both routes before anything reads the bus. The event feed is empty until the collector exists,
// and it says so.
import { Hono } from "hono";
import { cors } from "hono/cors";

export const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));

// The public feed. `api-` means public, browser-facing and credential-free (UIS networking docs):
// any website may read it, and the marketing site will. Read-only, so GET/HEAD only.
app.use("/v1/*", cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"] }));
app.get("/v1/events", (c) =>
  c.json({
    schema: "urb-events/1",
    events: [],
    note: "The collector is not built yet — no events are collected. See terchris/urb-agents-console.",
  }),
);

app.get("/", (c) =>
  c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fleet</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>The fleet, live</h1>
<p>This will show what the Urbalurba agent fleet is doing, close to real time. It is being built.</p>
<p>The public event feed is at <code>api-fleet</code>, under <code>/v1/events</code>.</p>
</body></html>`),
);
