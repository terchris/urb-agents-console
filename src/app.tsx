// The console, as one Hono app serving two hostnames (see docs/ai-developer/project-urb-agents-console.md):
//
//   fleet.<domain>       the page (src/page.tsx) — and, in phase 2, the logged-in API under /api/, same origin
//   api-fleet.<domain>   the PUBLIC, credential-free, read-only event feed under /v1/ (src/api.ts)
//
// The web app reads only the store; it never touches the bus. With no DATABASE_URL (deployed
// before its database exists) it serves an empty feed and says why, rather than failing.
import { Hono } from "hono";
import { createApi, cursorOf, parseCursor } from "./api";
import { Live, PAGE_SIZE, Page, type LiveProps } from "./page";
import { MemoryStore, PgStore, type Cursor, type Store } from "./store";

export const NO_DATABASE = "The collector is not running yet — no events are collected. See terchris/urb-agents-console.";

export function createApp(store: Store, note?: string) {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.route("/v1", createApi(store, note));

  // The page, and the part of it the page's script refreshes. Same-origin /v1 is the same public
  // feed as api-fleet, so the page needs no CORS.
  const live = async (before?: Cursor): Promise<LiveProps> => {
    const now = Date.now();
    const [events, agents] = await Promise.all([
      store.readEvents({ limit: PAGE_SIZE, before }),
      before ? Promise.resolve([]) : store.agents(new Date(now - 86_400_000)),
    ]);
    const last = events[events.length - 1];
    return { events, agents, now, next: events.length === PAGE_SIZE && last ? cursorOf(last) : null, paged: !!before };
  };

  app.get("/", async (c) => {
    const q = c.req.query("before");
    const before = q ? parseCursor(q) : undefined;
    if (before === null) return c.redirect("/");
    c.header("Cache-Control", "public, max-age=30");
    return c.html("<!doctype html>" + (<Page {...await live(before)} note={note} />));
  });

  app.get("/partials/live", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.html(<Live {...await live()} />);
  });

  return app;
}

const pg = PgStore.fromEnv();
export const app = pg ? createApp(pg) : createApp(new MemoryStore(), NO_DATABASE);
