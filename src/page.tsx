// The page at fleet.<domain>: Hono JSX, rendered on the server from the store (never the bus).
//
// It leads with the network: who sends work to whom (src/network-view.tsx). A filter row above
// scopes everything below it: the time window, and the agent being followed. Both are plain links,
// so the page works without JavaScript, and the timeline pages with ?before=<cursor>.
//
// With JavaScript, a small inline script fetches /partials/live (with the same query) every 30 s
// and swaps it in: new rows are marked, and the connections they belong to pulse. The partial is
// this same JSX, so there is one markup, not two.
//
// Times are rendered in one zone on the server (TZ_DISPLAY, default Europe/Oslo) and say so, so
// the page is correct without a script.
import type { FC } from "hono/jsx";
import { OTHERS } from "./allowlist";
import type { Event } from "./event";
import type { Window } from "./api";
import type { Laid } from "./network";
import { Focus, NetworkSvg, NetworkTable, TopPairs, type Href } from "./network-view";
import { activeNow, AgentPicker, Histogram, Inventory, ProfilePanel, Sparkline, Summary, summary } from "./insight-view";
import { CSS, FONTS, THEME_HEAD } from "./design";
import { RHYTHM_CSS, RhythmView, type Rhythm } from "./rhythm-view";
import type { Profile } from "./directory";
import type { AgentSummary } from "./store";
import { ZONE } from "./time";

export const PAGE_SIZE = 100;

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

function dayLabel(iso: string, now: number): string {
  const k = dayKey.format(new Date(iso));
  if (k === dayKey.format(new Date(now))) return "Today";
  if (k === dayKey.format(new Date(now - 86_400_000))) return "Yesterday";
  return dayFmt.format(new Date(iso));
}

const Who: FC<{ id: string | null }> = ({ id }) =>
  id === null ? <span class="who none">nobody</span>
    : id === OTHERS ? <span class="who others" title="An agent not on the public list">others</span>
      : <span class="who">{id}</span>;

// One sentence per event, claiming no more than the contract says. `from` and `to` are the TASK's
// sender and recipient; only `by` says who acted, and only on a reply. So a move or a close is
// described as happening to a task, never as something an agent did.
const Task: FC<{ e: Event }> = ({ e }) => (
  <>a task from <Who id={e.from} /> to <Who id={e.to} /></>
);

const What: FC<{ e: Event }> = ({ e }) => {
  switch (e.kind) {
    case "opened":
      return <><Who id={e.from} /> opened a task for <Who id={e.to} /></>;
    case "replied":
      if (e.by !== null && (e.by === e.from || e.by === e.to) && e.from !== e.to)
        return <><Who id={e.by} /> replied to <Who id={e.by === e.from ? e.to : e.from} /></>;
      if (e.by !== null && e.from === e.to && e.by === e.from) return <><Who id={e.by} /> replied on its own task</>;
      return e.by !== null ? <><Who id={e.by} /> replied on <Task e={e} /></> : <>A reply on <Task e={e} /></>;
    case "moved":
      return <>A task from <Who id={e.from} /> to <Who id={e.to} /> moved to <b class="state">{e.state ?? "a new state"}</b></>;
    case "closed":
      return <>A task from <Who id={e.from} /> to <Who id={e.to} /> was closed{e.state ? <> as <b class="state">{e.state}</b></> : null}</>;
  }
};

const Row: FC<{ e: Event; profiles: ReadonlyMap<string, Profile> }> = ({ e, profiles }) => (
  <li class={`ev k-${e.kind}`} data-id={e.id} data-pair={e.to ? `${e.from}>${e.to}` : undefined}>
    <time datetime={e.at}>{timeFmt.format(new Date(e.at))}</time>
    <span class="kind" aria-hidden="true"><Face id={e.kind === "replied" ? e.by : e.from} profiles={profiles} size={22} /><span class="dot" /></span>
    <span class="what"><What e={e} /></span>
    {e.model ? <span class="model" title={e.provider ?? undefined}>{e.model}</span> : null}
  </li>
);

const Timeline: FC<{ events: Event[]; now: number; next: string | null; href: Href; agent?: string; rhythm: Rhythm; paged: boolean; profiles: ReadonlyMap<string, Profile> }> = ({ events, now, next, href, agent, rhythm, paged, profiles }) => {
  const days: [string, Event[]][] = [];
  for (const e of events) {
    const label = dayLabel(e.at, now);
    const last = days[days.length - 1];
    if (last && last[0] === label) last[1].push(e);
    else days.push([label, [e]]);
  }
  return (
    <section aria-labelledby="tl" class="card">
      <div class="card-head"><h2 id="tl">Timeline{agent ? <small>{agent}'s events</small> : null}</h2><span class="kbd-hint">j / k to step through</span></div>
      <Histogram rhythm={rhythm} events={events} agent={agent} href={href} paged={paged} />
      <ul class="legend" aria-label="Kinds of event">
        <li class="k-opened"><span class="dot" />opened</li><li class="k-moved"><span class="dot" />moved</li>
        <li class="k-replied"><span class="dot" />replied</li><li class="k-closed"><span class="dot" />closed</li>
      </ul>
      {events.length === 0 ? <p class="empty">{paged ? "No events before this time." : "No events yet."}</p> : null}
      {days.map(([label, evs]) => (
        <>
          <h3 class="day">{label}</h3>
          <ol class="events">{evs.map((e) => <Row e={e} profiles={profiles} />)}</ol>
        </>
      ))}
      {next ? <p class="more"><a href={href({ before: next })}>Older events →</a></p> : null}
    </section>
  );
};

export const WINDOW_LABEL: Record<Window, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };

export type View = { window: Window; agent?: string };

/** A link to the page with this view, changed by `p`. `null` removes a parameter. */
export function viewHref(v: View, p: { agent?: string | null; window?: Window; before?: string }, base = "/"): string {
  const q = new URLSearchParams();
  const window = p.window ?? v.window;
  const agent = p.agent === undefined ? v.agent : p.agent ?? undefined;
  if (window !== "24h") q.set("window", window);
  if (agent) q.set("agent", agent);
  if (p.before) q.set("before", p.before);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export type LiveProps = View & {
  events: Event[]; agents: AgentSummary[]; total: number; network: Laid; rhythm: Rhythm;
  /** The same network laid out for a phone (labels inside the circle). */
  networkCompact: Laid;
  /** Marketing's profiles (role, page, avatar) for the agents with a page; empty until read. */
  profiles: ReadonlyMap<string, Profile>;
  now: number; next: string | null; paged: boolean;
};

/** An agent's face: marketing's avatar where there is one, else its initials on a neutral disc. */
export const Face: FC<{ id: string | null; profiles: ReadonlyMap<string, Profile>; size: number }> = ({ id, profiles, size }) => {
  const src = id ? profiles.get(id)?.avatar : null;
  if (src) return <img class="face" src={src} alt="" width={size} height={size} loading="lazy" />;
  const initials = id === null ? "?" : id === OTHERS ? "…" : id.split("-").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span class="face initials" style={`width:${size}px;height:${size}px`} aria-hidden="true">{initials}</span>;
};

/** Who acted, as far as the contract says: the replier on a reply, the sender otherwise. */
const actor = (e: Event) => (e.kind === "replied" ? e.by : e.from);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Four stat tiles: the fleet's, or the followed agent's. */
const Tiles: FC<LiveProps & { lines: { active: string } }> = (p) => {
  const lines = p.lines;
  const active = activeNow(p.agents, p.now);
  const a = p.agent ? p.agents.find((x) => x.id === p.agent) : undefined;
  const spark = p.agent ? p.rhythm.agents.find((x) => x.id === p.agent)?.counts ?? p.rhythm.total.map(() => 0) : p.rhythm.total;
  const events = p.agent ? p.network.nodes.find((n) => n.id === p.agent)?.events ?? 0 : p.total;
  const newest = p.events[0];
  const faces = [...active].slice(0, 6);
  const sum = (k: "opened" | "received" | "replied") => p.agents.reduce((n, x) => n + x[k], 0);
  return (
    <div class="tiles">
      <div class="tile">
        <span class="t-label">Events · last {WINDOW_LABEL[p.window]}</span>
        <span class="t-value">{events.toLocaleString("en-GB")}</span>
        <Sparkline counts={spark} fill />
        <span class="t-sub">{newest ? `last ${ago(newest.at, p.now)}` : "none yet"}</span>
      </div>
      {p.agent ? (
        <div class="tile">
          <span class="t-label">Tasks opened / received</span>
          <span class="t-value">{a?.opened ?? 0}<span class="muted"> / {a?.received ?? 0}</span></span>
          <span class="t-sub">as sender / as recipient</span>
        </div>
      ) : (
        <div class="tile">
          <span class="t-label">Active now</span>
          <span class="t-value">{active.size}</span>
          <span class="stack">{faces.map((id) => <Face id={id} profiles={p.profiles} size={26} />)}{active.size > faces.length ? <span class="more">+{active.size - faces.length}</span> : null}</span>
          <span class="t-sub">in the last 10 minutes</span>
          <span class="sr">{lines.active}</span>
        </div>
      )}
      <div class="tile">
        <span class="t-label">{p.agent ? "Replies written" : "Tasks opened"}</span>
        <span class="t-value">{(p.agent ? a?.replied ?? 0 : sum("opened")).toLocaleString("en-GB")}</span>
        {p.agent ? null : <Top agents={p.agents} k="opened" profiles={p.profiles} />}
        <span class="t-sub">{p.agent ? (a?.models[0] ? `mostly ${a.models[0].name}` : "no model recorded") : `by ${p.agents.filter((x) => x.opened > 0).length} agents`}</span>
      </div>
      <div class="tile">
        <span class="t-label">{p.agent ? "Works with" : "Replies"}</span>
        <span class="t-value">{p.agent
          ? new Set(p.network.links.filter((l) => l.from === p.agent || l.to === p.agent).map((l) => (l.from === p.agent ? l.to : l.from))).size
          : sum("replied").toLocaleString("en-GB")}</span>
        {p.agent ? null : <Top agents={p.agents} k="replied" profiles={p.profiles} />}
        <span class="t-sub">{p.agent ? "agents, in either direction" : `on ${plural(p.network.links.length, "connection")}`}</span>
      </div>
    </div>
  );
};

/** The five agents with the most of `k`, as faces, busiest first. */
const Top: FC<{ agents: AgentSummary[]; k: "opened" | "replied"; profiles: ReadonlyMap<string, Profile> }> = ({ agents, k, profiles }) => {
  const top = [...agents].filter((a) => a[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 5);
  return (
    <span class="stack" data-tip={top.map((a) => `${a.id} ${a[k]}`).join(" · ")}>
      {top.map((a) => <Face id={a.id} profiles={profiles} size={26} />)}
    </span>
  );
};

/** The latest events, compact, with faces: the "what is happening now" column. */
const RightNow: FC<{ events: Event[]; now: number; profiles: ReadonlyMap<string, Profile> }> = ({ events, now, profiles }) => (
  <section class="card span-4 feed-card" aria-labelledby="rn">
    <div class="card-head"><h2 id="rn">Right now</h2><span class="sub">the latest on the bus</span></div>
    {events.length === 0 ? <p class="empty">Nothing yet.</p> : (
      <ol class="feed">
        {events.slice(0, 8).map((e) => (
          <li class={`k-${e.kind}`}>
            <Face id={actor(e)} profiles={profiles} size={30} />
            <div>
              <div class="f-what"><What e={e} /></div>
              <div class="f-meta"><span class="dot" aria-hidden="true" />{e.kind} · <time datetime={e.at}>{ago(e.at, now)}</time></div>
            </div>
          </li>
        ))}
      </ol>
    )}
  </section>
);

/** The part the script refreshes. */
export const Live: FC<LiveProps> = (p) => {
  const href: Href = (q) => viewHref(p, q);
  const lines = p.paged ? [] : summary({ agents: p.agents, network: p.network, total: p.total, windowLabel: WINDOW_LABEL[p.window], now: p.now, agent: p.agent });
  const profile = p.agent ? p.profiles.get(p.agent) : undefined;
  const active = activeNow(p.agents, p.now);
  return (
    <div id="live" data-paged={p.paged ? "1" : "0"}>
      {!p.paged && profile?.summary ? <ProfilePanel profile={profile} /> : null}
      {p.paged ? <p class="note">Older events, from the time you picked. <a href={href({})}>Back to now</a></p> : <Tiles {...p} lines={{ active: lines[lines.length - 1] ?? "" }} />}
      {lines.length > 1 ? <Summary lines={lines.slice(0, -1)} /> : null}
      <div class="grid">
        {p.paged ? null : (
          <section aria-labelledby="nw" class="card span-8 network">
            <div class="card-head"><h2 id="nw">Who sends work to whom</h2><span class="sub">last {WINDOW_LABEL[p.window]}</span></div>
            <p class="how">An arrow runs from the agent that opened a task to the agent it was for; its width is how much happened on their tasks. Pick an agent to follow it.</p>
            {p.agent ? <Focus laid={p.network} agent={p.agent} href={href} profile={profile} /> : null}
            <NetworkSvg laid={p.network} agent={p.agent} href={href} active={active} profiles={p.profiles} />
            <NetworkSvg laid={p.networkCompact} agent={p.agent} href={href} active={active} profiles={p.profiles} compact />
            <TopPairs laid={p.network} agent={p.agent} profiles={p.profiles} face={Face} />
            <NetworkTable laid={p.network} agent={p.agent} />
          </section>
        )}
        {p.paged ? null : <RightNow events={p.events} now={p.now} profiles={p.profiles} />}
        {p.paged ? null : <RhythmView r={p.rhythm} agent={p.agent} href={href} />}
        {p.paged ? null : <Inventory agents={p.agents} network={p.network} rhythm={p.rhythm} now={p.now} windowLabel={WINDOW_LABEL[p.window]} agent={p.agent} href={href} profiles={p.profiles} />}
        <Timeline events={p.events} now={p.now} next={p.next} href={href} agent={p.agent} rhythm={p.rhythm} paged={p.paged} profiles={p.profiles} />
      </div>
    </div>
  );
};

/** `live`: only when there is a database behind the page; otherwise the pill says it is waiting. */
const TopBar: FC<View & { live: boolean }> = (v) => (
  <header class="bar">
    <div class="wrap">
      <span class="brand-group" style="display:flex;align-items:center;gap:10px;margin-right:auto">
        <a class="brand" href="/"><span class="mark" aria-hidden="true" />urb fleet</a>
        {v.live
          ? <span class="live-pill"><span class="live-dot" aria-hidden="true" />Live</span>
          : <span class="live-pill waiting" title="No events are being collected yet">Waiting</span>}
      </span>
      <nav class="controls" aria-label="What to show">
        <span class="seg" role="group" aria-label="Time window">
          {(Object.keys(WINDOW_LABEL) as Window[]).map((w) => (
            <a href={viewHref(v, { window: w })} aria-current={w === v.window ? "true" : undefined}>{w}</a>
          ))}
        </span>
        <AgentPicker window={v.window} agent={v.agent} />
        {v.agent ? <a class="chip-x" href={viewHref(v, { agent: null })} id="stop-following" aria-label={`Stop following ${v.agent}`}>✕ {v.agent}</a> : null}
        <button type="button" class="icon-btn" id="theme-btn" aria-label="Theme: follows your system">◐</button>
        <button type="button" class="icon-btn" id="keys-btn" aria-controls="keys" aria-keyshortcuts="?" aria-label="Keyboard shortcuts">?</button>
      </nav>
    </div>
  </header>
);

// The network on a bare page, for another site to put in an iframe (the marketing site first).
// Its links open the full page at the top level. It refreshes itself every minute.
export const Embed: FC<{ laid: Laid; laidCompact: Laid; window: Window; total: number; active?: Set<string>; profiles?: ReadonlyMap<string, Profile> }> = (p) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Who sends work to whom · the fleet, live</title>
      <link rel="stylesheet" href={FONTS} />
      <style dangerouslySetInnerHTML={{ __html: CSS + EMBED_CSS }} />
    </head>
    <body class="embed">
      <p class="cap">
        <a href={viewHref({ window: p.window }, {})} target="_top">Who sends work to whom</a> in the Urbalurba agent fleet ·{" "}
        {p.total} {p.total === 1 ? "event" : "events"} in the last {WINDOW_LABEL[p.window]}
      </p>
      <NetworkSvg laid={p.laid} href={(q) => viewHref({ window: p.window }, q)} target="_top" active={p.active} profiles={p.profiles} />
      <NetworkSvg laid={p.laidCompact} href={(q) => viewHref({ window: p.window }, q)} target="_top" active={p.active} profiles={p.profiles} compact />
      <div id="tip" role="tooltip" hidden />
      <script dangerouslySetInnerHTML={{ __html: EMBED_SCRIPT }} />
    </body>
  </html>
);

const EMBED_CSS = `
body.embed{background:transparent;margin:0}
.embed .cap{margin:0 0 .25rem;padding:0 8px;font-size:.85rem;color:var(--muted)}
.embed .cap a{color:var(--ink);font-weight:600;text-decoration:none}
`;

const EMBED_SCRIPT = `(() => {
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(location.href);
      if (!r.ok) return;
      const d = new DOMParser().parseFromString(await r.text(), "text/html");
      for (const sel of ["svg.net-wide", "svg.net-compact", ".cap"]) {
        const fresh = d.querySelector(sel), old = document.querySelector(sel);
        if (fresh && old) old.replaceWith(fresh);
      }
    } catch {}
  }, 60000);
  const tip = document.getElementById("tip");
  document.addEventListener("pointermove", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-tip]");
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    tip.style.left = Math.min(Math.max(8, ev.clientX + 12), innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = Math.max(8, ev.clientY - tip.offsetHeight - 12) + "px";
  });
})();`;

export const Page: FC<LiveProps & { note?: string }> = (p) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>The fleet, live</title>
      <meta name="description" content="Who sends work to whom in the Urbalurba agent fleet, close to real time." />
      <meta name="color-scheme" content="light dark" />
      <script dangerouslySetInnerHTML={{ __html: THEME_HEAD }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link rel="stylesheet" href={FONTS} />
      <style dangerouslySetInnerHTML={{ __html: CSS + RHYTHM_CSS }} />
    </head>
    <body>
      <TopBar window={p.window} agent={p.agent} live={!p.note} />
      <main class="wrap">
        <header class="hero">
          <h1>The fleet, live</h1>
          <p class="lede">What the Urbalurba agents are sending each other on their bus, about a minute behind.</p>
          {p.note ? <p class="note">{p.note}</p> : null}
        </header>
        <Live {...p} />
        <footer>
          <p>
            Shown: when, the task's sender and recipient, who replied, the new state, and the model that wrote it
            where the bus records one. Never a task's title, body or number.
            Agents that are not on the public list appear as <i>others</i>. Times are {ZONE.replace("_", " ")} time.
          </p>
          <p>The same data as JSON: <a href="/v1/network">/v1/network</a> · <a href="/v1/activity">/v1/activity</a> · <a href="/v1/agents">/v1/agents</a> · <a href="/v1/events">/v1/events</a> · <a href="/v1/openapi.json">OpenAPI 3.1</a></p>
        </footer>
      </main>
      <div id="tip" role="tooltip" hidden />
      <dialog id="keys" aria-labelledby="keys-title">
        <h2 id="keys-title">Keyboard</h2>
        <dl>
          <dt><kbd>/</kbd></dt><dd>choose an agent to follow</dd>
          <dt><kbd>Esc</kbd></dt><dd>stop following</dd>
          <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>shorter or longer time window</dd>
          <dt><kbd>j</kbd> <kbd>k</kbd></dt><dd>next or previous event in the timeline</dd>
          <dt><kbd>?</kbd></dt><dd>this list</dd>
        </dl>
        <form method="dialog"><button>Close</button></form>
      </dialog>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </body>
  </html>
);

// Refresh every 30 s (unless paging back), mark new rows, and pulse the connections they belong
// to. Tooltips read data-tip and are set with textContent: agent ids are data, never markup.
export const SCRIPT = `(() => {
  const seen = new Set([...document.querySelectorAll("#live .ev")].map((e) => e.dataset.id));
  async function tick() {
    const live = document.getElementById("live");
    if (!live || live.dataset.paged === "1" || document.hidden) return;
    if (document.activeElement && document.activeElement.classList.contains("ev")) return; // the reader is stepping with j/k
    try {
      const r = await fetch("/partials/live" + location.search, { headers: { accept: "text/html" } });
      if (!r.ok) return;
      const t = document.createElement("template");
      t.innerHTML = await r.text();
      const fresh = t.content.getElementById("live");
      if (!fresh) return;
      const open = [...live.querySelectorAll("details")].map((d) => d.open);
      for (const e of fresh.querySelectorAll(".ev")) {
        if (seen.has(e.dataset.id)) continue;
        seen.add(e.dataset.id);
        e.classList.add("fresh");
        if (e.dataset.pair) fresh.querySelectorAll('.link[data-pair="' + CSS.escape(e.dataset.pair) + '"]').forEach((l) => l.classList.add("pulse"));
      }
      fresh.querySelectorAll("details").forEach((d, i) => { if (open[i]) d.setAttribute("open", ""); });
      live.replaceWith(fresh);
      if (sortBy) sortTable(sortBy, sortDir);
    } catch {}
  }
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", tick);

  // The agent table sorts by any column with a button; the choice survives the refresh.
  let sortBy = null, sortDir = -1;
  function sortTable(key, dir) {
    const table = document.querySelector("table.inv");
    if (!table) return;
    const body = table.tBodies[0];
    const rows = [...body.rows];
    rows.sort((a, b) => {
      const x = a.dataset[key], y = b.dataset[key];
      const c = key === "name" ? x.localeCompare(y) : Number(x) - Number(y);
      return c * dir || a.dataset.name.localeCompare(b.dataset.name);
    });
    for (const r of rows) body.appendChild(r);
    for (const th of table.tHead.rows[0].cells) {
      const btn = th.querySelector("button");
      if (btn) th.setAttribute("aria-sort", btn.dataset.sort === key ? (dir < 0 ? "descending" : "ascending") : "none");
    }
  }
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest && ev.target.closest("table.inv th button[data-sort]");
    if (btn) {
      const key = btn.dataset.sort;
      sortDir = sortBy === key ? -sortDir : key === "name" ? 1 : -1;
      sortBy = key;
      sortTable(sortBy, sortDir);
    }
    if (ev.target.id === "keys-btn") document.getElementById("keys").showModal();
    if (ev.target.id === "theme-btn") cycleTheme();
  });

  // Light, dark, or the system's: remembered in this browser only.
  const themeBtn = document.getElementById("theme-btn");
  const themeLabel = () => {
    const t = document.documentElement.dataset.theme;
    themeBtn.textContent = t === "light" ? "☀" : t === "dark" ? "☾" : "◐";
    themeBtn.setAttribute("aria-label", "Theme: " + (t || "follows your system"));
  };
  function cycleTheme() {
    const t = document.documentElement.dataset.theme;
    const next = !t ? "light" : t === "light" ? "dark" : null;
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    try { next ? localStorage.setItem("theme", next) : localStorage.removeItem("theme"); } catch {}
    themeLabel();
  }
  if (themeBtn) themeLabel();

  // Choosing an agent in the picker follows it straight away.
  document.addEventListener("change", (ev) => {
    if (ev.target.id === "agent-pick") ev.target.form.requestSubmit();
  });

  // Keys, as listed under "Keys". Never while typing in a field, and never with a modifier.
  document.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    if (t.closest && t.closest("input, select, textarea, dialog")) {
      if (ev.key === "Escape" && t.id === "agent-pick") t.blur();
      return;
    }
    const windows = [...document.querySelectorAll(".seg a")];
    const current = windows.findIndex((a) => a.hasAttribute("aria-current"));
    if (ev.key === "/") { ev.preventDefault(); document.getElementById("agent-pick")?.focus(); }
    else if (ev.key === "?") { ev.preventDefault(); document.getElementById("keys").showModal(); }
    else if (ev.key === "Escape") { const s = document.getElementById("stop-following"); if (s) location.href = s.href; }
    else if (ev.key === "[" && current > 0) location.href = windows[current - 1].href;
    else if (ev.key === "]" && current >= 0 && current < windows.length - 1) location.href = windows[current + 1].href;
    else if (ev.key === "j" || ev.key === "k") {
      const evs = [...document.querySelectorAll("#live .ev")];
      if (!evs.length) return;
      ev.preventDefault();
      const at = evs.indexOf(document.activeElement);
      const next = evs[Math.max(0, Math.min(evs.length - 1, at < 0 ? 0 : at + (ev.key === "j" ? 1 : -1)))];
      next.tabIndex = -1;
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    }
  });

  const tip = document.getElementById("tip");
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(8, x + 12), innerWidth - w - 8) + "px";
    tip.style.top = Math.max(8, y - h - 12) + "px";
  };
  document.addEventListener("pointermove", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el) show(el, ev.clientX, ev.clientY); else tip.hidden = true;
  });
  document.addEventListener("focusin", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-tip]");
    if (!el) { tip.hidden = true; return; }
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  document.addEventListener("focusout", () => { tip.hidden = true; });
})();`;

