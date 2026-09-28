// The console, as one Hono app serving two hostnames (see docs/ai-developer/project-urb-agents-console.md):
//
//   fleet.<domain>       the page (src/page.tsx) — and, in phase 2, the logged-in API under /api/, same origin
//   api-fleet.<domain>   the PUBLIC, credential-free, read-only event feed under /v1/ (src/api.ts)
//
// The web app reads only the store; it never touches the bus. With no DATABASE_URL (deployed
// before its database exists) it serves an empty feed and says why, rather than failing.
import { Hono } from "hono";
import { named, OTHERS } from "./allowlist";
import { createApi, cursorOf, parseCursor, WINDOWS, type Window } from "./api";
import { DirectoryCache } from "./directory";
import { activeNow } from "./insight-view";
import { layout } from "./network";
import { bucketsFor } from "./time";
import { Embed, Live, PAGE_SIZE, Page, type LiveProps } from "./page";
import { MemoryStore, PgStore, type Cursor, type Store } from "./store";

export const NO_DATABASE = "The collector is not running yet — no events are collected. See terchris/urb-agents-console.";

/** The web app's copy of marketing's agent list (index.ts refreshes it). */
export const directory = new DirectoryCache();

export function createApp(store: Store, note?: string, dir: DirectoryCache = directory) {
  const avatars = () => new Set([...dir.profiles().values()].filter((p) => p.avatar).map((p) => p.id));
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.route("/v1", createApi(store, note));

  // The page, and the part of it the page's script refreshes. Both take the same view: the window,
  // the agent followed, and a cursor for older events. A view that is not valid goes home rather
  // than failing. Same-origin /v1 is the same public feed as api-fleet, so the page needs no CORS.
  const view = (q: (k: string) => string | undefined) => {
    const w = q("window") ?? "24h";
    const agent = q("agent") || undefined; // the picker's "everyone" sends an empty value
    const before = q("before");
    const cursor = before ? parseCursor(before) : undefined;
    const ok = w in WINDOWS && (agent === undefined || agent === OTHERS || named().has(agent)) && cursor !== null;
    return ok ? { window: w as Window, agent, before: cursor ?? undefined } : null;
  };

  const live = async (v: { window: Window; agent?: string; before?: Cursor }): Promise<LiveProps> => {
    const now = Date.now();
    const since = new Date(now - WINDOWS[v.window]);
    const { size, starts } = bucketsFor(v.window, now);
    const [events, agents, total, net, act] = await Promise.all([
      store.readEvents({ limit: PAGE_SIZE, before: v.before, agent: v.agent }),
      v.before ? Promise.resolve([]) : store.agents(since),
      v.before ? Promise.resolve(0) : store.count(since),
      v.before ? Promise.resolve({ nodes: [], links: [] }) : store.network(since),
      store.activity({ origin: starts[0]!, size, count: starts.length }), // the timeline's histogram needs it on older pages too
    ]);
    const last = events[events.length - 1];
    return {
      window: v.window, agent: v.agent, events, agents, total, network: layout(net, undefined, avatars()), now, profiles: dir.profiles(),
      rhythm: { ...act, window: v.window, starts, size },
      next: events.length === PAGE_SIZE && last ? cursorOf(last) : null, paged: !!v.before,
    };
  };

  app.get("/", async (c) => {
    const v = view((k) => c.req.query(k));
    if (!v) return c.redirect("/");
    c.header("Cache-Control", "public, max-age=30");
    return c.html("<!doctype html>" + (<Page {...await live(v)} note={note} />));
  });

  app.get("/partials/live", async (c) => {
    const v = view((k) => c.req.query(k));
    if (!v) return c.text("not a view", 400);
    c.header("Cache-Control", "no-store");
    return c.html(<Live {...await live(v)} />);
  });

  app.get("/embed/network", async (c) => {
    const v = view((k) => c.req.query(k));
    if (!v || v.agent || v.before) return c.text("the embed takes ?window= only", 400);
    const since = new Date(Date.now() - WINDOWS[v.window]);
    const [net, total, agents] = await Promise.all([store.network(since), store.count(since), store.agents(since)]);
    c.header("Cache-Control", "public, max-age=60");
    return c.html("<!doctype html>" + (<Embed laid={layout(net, undefined, avatars())} window={v.window} total={total} active={activeNow(agents, Date.now())} profiles={dir.profiles()} />));
  });

  return app;
}

const pg = PgStore.fromEnv();
export const app = pg ? createApp(pg) : createApp(new MemoryStore(), NO_DATABASE);
