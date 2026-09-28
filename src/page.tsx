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
import { Focus, NetworkSvg, NetworkTable, type Href } from "./network-view";
import type { AgentSummary } from "./store";

export const PAGE_SIZE = 100;
const ZONE = process.env.TZ_DISPLAY ?? "Europe/Oslo";

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

const Row: FC<{ e: Event }> = ({ e }) => (
  <li class={`ev k-${e.kind}`} data-id={e.id} data-pair={e.to ? `${e.from}>${e.to}` : undefined}>
    <time datetime={e.at}>{timeFmt.format(new Date(e.at))}</time>
    <span class="dot" aria-hidden="true" />
    <span class="what"><What e={e} /></span>
    {e.model ? <span class="model" title={e.provider ?? undefined}>{e.model}</span> : null}
  </li>
);

const Timeline: FC<{ events: Event[]; now: number; next: string | null; href: Href; agent?: string }> = ({ events, now, next, href, agent }) => {
  const days: [string, Event[]][] = [];
  for (const e of events) {
    const label = dayLabel(e.at, now);
    const last = days[days.length - 1];
    if (last && last[0] === label) last[1].push(e);
    else days.push([label, [e]]);
  }
  return (
    <section aria-labelledby="tl">
      <h2 id="tl">Timeline{agent ? <small>{agent}'s events</small> : null}</h2>
      <ul class="legend" aria-label="Kinds of event">
        <li class="k-opened"><span class="dot" />opened</li><li class="k-moved"><span class="dot" />moved</li>
        <li class="k-replied"><span class="dot" />replied</li><li class="k-closed"><span class="dot" />closed</li>
      </ul>
      {events.length === 0 ? <p class="empty">No events yet.</p> : null}
      {days.map(([label, evs]) => (
        <>
          <h3 class="day">{label}</h3>
          <ol class="events">{evs.map((e) => <Row e={e} />)}</ol>
        </>
      ))}
      {next ? <p class="more"><a href={href({ before: next })}>Older events →</a></p> : null}
    </section>
  );
};

const Agents: FC<{ agents: AgentSummary[]; now: number; window: Window; href: Href }> = ({ agents, now, window, href }) => (
  <section aria-labelledby="ag">
    <h2 id="ag">Agents <small>last {WINDOW_LABEL[window]}</small></h2>
    {agents.length === 0 ? <p class="empty">Nobody has been active in this window.</p> : (
      <ul class="agents">
        {agents.map((a) => (
          <li class={a.id === OTHERS ? "agent others" : "agent"}>
            <a class="name" href={href({ agent: a.id })}>{a.id}</a>
            <span class="seen">{ago(a.lastSeen, now)}</span>
            <span class="counts">
              <span title="tasks it opened">{a.opened} opened</span>
              <span title="tasks opened to it">{a.received} received</span>
              <span title="replies it wrote">{a.replied} {a.replied === 1 ? "reply" : "replies"}</span>
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

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
  events: Event[]; agents: AgentSummary[]; total: number; network: Laid;
  now: number; next: string | null; paged: boolean;
};

/** The part the script refreshes. */
export const Live: FC<LiveProps> = (p) => {
  const href: Href = (q) => viewHref(p, q);
  const newest = p.events[0];
  return (
    <div id="live" data-paged={p.paged ? "1" : "0"}>
      <p class="pulse" role="status">
        <span class="live-dot" aria-hidden="true" />
        {p.paged ? "Older events" : newest
          ? <>Last event {ago(newest.at, p.now)} · {p.total} {p.total === 1 ? "event" : "events"} in the last {WINDOW_LABEL[p.window]}</>
          : "Waiting for the first event"}
      </p>
      {p.paged ? null : (
        <section aria-labelledby="nw" class="network">
          <h2 id="nw">Who sends work to whom <small>last {WINDOW_LABEL[p.window]}</small></h2>
          <p class="how">An arrow runs from the agent that opened a task to the agent it was for, and its width is how much has happened on their tasks. Pick an agent to follow its part.</p>
          {p.agent ? <Focus laid={p.network} agent={p.agent} href={href} /> : null}
          <NetworkSvg laid={p.network} agent={p.agent} href={href} />
          <NetworkTable laid={p.network} agent={p.agent} />
        </section>
      )}
      {p.paged ? null : <Agents agents={p.agents} now={p.now} window={p.window} href={href} />}
      <Timeline events={p.events} now={p.now} next={p.next} href={href} agent={p.agent} />
    </div>
  );
};

const Filters: FC<View> = (v) => (
  <nav class="filters" aria-label="What to show">
    <span class="seg" role="group" aria-label="Time window">
      {(Object.keys(WINDOW_LABEL) as Window[]).map((w) => (
        <a href={viewHref(v, { window: w })} aria-current={w === v.window ? "true" : undefined}>{w}</a>
      ))}
    </span>
    {v.agent ? (
      <span class="chip">Following <b>{v.agent}</b> <a href={viewHref(v, { agent: null })} aria-label="Stop following">✕</a></span>
    ) : <span class="hint">Pick an agent in the network to follow it</span>}
  </nav>
);

// The network on a bare page, for another site to put in an iframe (the marketing site first).
// Its links open the full page at the top level. It refreshes itself every minute.
export const Embed: FC<{ laid: Laid; window: Window; total: number }> = (p) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Who sends work to whom · the fleet, live</title>
      <style dangerouslySetInnerHTML={{ __html: CSS + EMBED_CSS }} />
    </head>
    <body class="embed">
      <p class="cap">
        <a href={viewHref({ window: p.window }, {})} target="_top">Who sends work to whom</a> in the Urbalurba agent fleet ·{" "}
        {p.total} {p.total === 1 ? "event" : "events"} in the last {WINDOW_LABEL[p.window]}
      </p>
      <NetworkSvg laid={p.laid} href={(q) => viewHref({ window: p.window }, q)} target="_top" />
      <div id="tip" role="tooltip" hidden />
      <script dangerouslySetInnerHTML={{ __html: EMBED_SCRIPT }} />
    </body>
  </html>
);

const EMBED_CSS = `
body.embed{background:transparent;margin:0}
.embed .cap{margin:0 0 .25rem;padding:0 8px;font-size:.85rem;color:var(--muted)}
.embed .cap a{color:var(--fg);font-weight:600;text-decoration:none}
.embed .net{max-height:none}
`;

// Refresh the drawing every minute, and show the same tooltips as the page.
const EMBED_SCRIPT = `(() => {
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(location.href);
      if (!r.ok) return;
      const d = new DOMParser().parseFromString(await r.text(), "text/html");
      for (const sel of ["svg.net", ".cap"]) {
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
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <main>
        <header>
          <h1>The fleet, live</h1>
          <p class="lede">What the Urbalurba agents are sending each other on their bus, about a minute behind.</p>
          {p.note ? <p class="note">{p.note}</p> : null}
        </header>
        <Filters window={p.window} agent={p.agent} />
        <Live {...p} />
        <footer>
          <p>
            Shown: when, the task's sender and recipient, who replied, the new state, and the model that wrote it
            where the bus records one. Never a task's title, body or number.
            Agents that are not on the public list appear as <i>others</i>. Times are {ZONE.replace("_", " ")} time.
          </p>
          <p>The same data as JSON: <a href="/v1/network">/v1/network</a> · <a href="/v1/events">/v1/events</a> · <a href="/v1/openapi.json">OpenAPI 3.1</a></p>
        </footer>
      </main>
      <div id="tip" role="tooltip" hidden />
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
    try {
      const r = await fetch("/partials/live" + location.search, { headers: { accept: "text/html" } });
      if (!r.ok) return;
      const t = document.createElement("template");
      t.innerHTML = await r.text();
      const fresh = t.content.getElementById("live");
      if (!fresh) return;
      const open = live.querySelector("details.twin")?.open;
      for (const e of fresh.querySelectorAll(".ev")) {
        if (seen.has(e.dataset.id)) continue;
        seen.add(e.dataset.id);
        e.classList.add("fresh");
        const pair = e.dataset.pair && fresh.querySelector('.link[data-pair="' + CSS.escape(e.dataset.pair) + '"]');
        if (pair) pair.classList.add("pulse");
      }
      if (open) fresh.querySelector("details.twin")?.setAttribute("open", "");
      live.replaceWith(fresh);
    } catch {}
  }
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", tick);

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

// Kind colours: the dataviz reference categorical slots 1-4 in fixed order, validated on this
// page's own surfaces (light: all pass, contrast relieved by the kind written in words; dark: all pass).
export const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a64;--line:#e6e3da;--card:#ffffff;--accent:#2a78d6;
  --link:#9b9a93;--node:#6b6a64;--fresh:#fff4c2;
  --opened:#2a78d6;--moved:#eb6834;--replied:#1baf7a;--closed:#eda100}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15161a;--fg:#ecebe6;--muted:#9a9a94;--line:#2a2c33;--card:#1c1e24;--accent:#3987e5;
  --link:#6c6e75;--node:#a3a39c;--fresh:#3a3520;
  --opened:#3987e5;--moved:#d95926;--replied:#199e70;--closed:#c98500}}
:root[data-theme="dark"]{--bg:#15161a;--fg:#ecebe6;--muted:#9a9a94;--line:#2a2c33;--card:#1c1e24;--accent:#3987e5;
  --link:#6c6e75;--node:#a3a39c;--fresh:#3a3520;
  --opened:#3987e5;--moved:#d95926;--replied:#199e70;--closed:#c98500}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:56rem;margin:0 auto;padding:2.5rem 16px 4rem}
h1{font-size:1.9rem;margin:0 0 .25rem;letter-spacing:-.01em}
h2{font-size:1rem;margin:2rem 0 .5rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
h2 small{text-transform:none;letter-spacing:0;font-weight:400;margin-left:.4rem}
h3.day{font-size:.95rem;margin:1.5rem 0 .25rem;color:var(--muted);font-weight:600}
a{color:var(--accent)}
.lede{margin:0;color:var(--muted)}
.muted{color:var(--muted)}
.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.6rem .8rem}
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;margin:1.25rem 0 0}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--card)}
.seg a{padding:.25rem .75rem;text-decoration:none;color:var(--fg);font-size:.9rem}
.seg a+a{border-left:1px solid var(--line)}
.seg a[aria-current]{background:var(--fg);color:var(--bg);font-weight:600}
.chip{font-size:.9rem;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:.15rem .4rem .15rem .7rem}
.chip a{text-decoration:none;margin-left:.3rem;color:var(--muted)}
.hint{font-size:.85rem;color:var(--muted)}
.pulse{display:flex;align-items:center;gap:.5rem;margin:1rem 0 0;color:var(--muted);font-size:.9rem}
.live-dot{flex-shrink:0;width:.55rem;height:.55rem;border-radius:50%;background:var(--replied);animation:beat 2.4s infinite}
@keyframes beat{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--replied) 60%,transparent)}70%{box-shadow:0 0 0 .5rem transparent}100%{box-shadow:0 0 0 0 transparent}}
.how{margin:0 0 .5rem;color:var(--muted);font-size:.9rem;max-width:44rem}
.focus{margin:.25rem 0 .5rem}
.net{display:block;width:100%;height:auto;max-height:36rem;overflow:visible}
.net .link .edge{fill:none;stroke:var(--link);stroke-linecap:round;opacity:var(--w,.75)}
.net .link .head{fill:var(--link);opacity:var(--w,.75)}
.net .link .hit{fill:none;stroke:transparent;stroke-width:14}
.net .link:hover .edge,.net .link.hot .edge{stroke:var(--accent);opacity:1}
.net .link:hover .head,.net .link.hot .head{fill:var(--accent);opacity:1}
.net.has-sel .link:not(.hot){opacity:.18}
.net .node .dot{fill:var(--node);stroke:var(--bg);stroke-width:2}
.net .node .hit{fill:transparent}
.net .node text{fill:var(--fg);font-size:13px;font-weight:600}
.net .node.idle .dot{fill:var(--line)}
.net .node.idle text{fill:var(--muted);font-weight:400}
.net .node.others text{font-style:italic;font-weight:500}
.net .node.sel .dot{fill:var(--accent)}
.net.has-sel .node:not(.sel):not(.nb){opacity:.35}
.net a:focus-visible .dot{stroke:var(--accent);stroke-width:3}
.net a:focus{outline:none}
.net .link.pulse .edge{animation:pulse-edge 2.5s ease-out 2}
.net .link.pulse .head{animation:pulse-head 2.5s ease-out 2}
@keyframes pulse-edge{0%{stroke:var(--accent);opacity:1;stroke-width:9}100%{}}
@keyframes pulse-head{0%{fill:var(--accent);opacity:1}100%{}}
@media (prefers-reduced-motion:reduce){.live-dot,.net .link.pulse .edge,.net .link.pulse .head,.fresh{animation:none}}
#tip{position:fixed;z-index:10;max-width:22rem;pointer-events:none;background:var(--fg);color:var(--bg);font-size:.8rem;line-height:1.35;padding:.35rem .55rem;border-radius:6px}
.twin{margin:.5rem 0 0;font-size:.9rem}
.twin summary{cursor:pointer;color:var(--accent)}
.twin table{border-collapse:collapse;margin-top:.5rem;width:100%;max-width:36rem}
.twin th,.twin td{text-align:left;padding:.2rem .6rem .2rem 0;border-bottom:1px solid var(--line)}
.twin th{color:var(--muted);font-weight:600}
.twin .n{text-align:right;font-variant-numeric:tabular-nums}
.agents{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(12.5rem,100%),1fr));gap:.5rem}
.agent{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.55rem .7rem;display:grid;grid-template-columns:1fr auto;gap:.1rem .5rem}
.agent .name{font-weight:600;overflow-wrap:anywhere;color:var(--fg);text-decoration:none}
.agent .name:hover{text-decoration:underline}
.agent .seen{color:var(--muted);font-size:.8rem;white-space:nowrap}
.agent .counts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.2rem .7rem;color:var(--muted);font-size:.8rem}
.agent.others{border-style:dashed}
.agent.others .name{font-style:italic;font-weight:500}
.legend{list-style:none;padding:0;margin:0 0 .25rem;display:flex;flex-wrap:wrap;gap:.25rem 1rem;color:var(--muted);font-size:.85rem}
.legend li{display:flex;align-items:center;gap:.35rem}
.events{list-style:none;padding:0;margin:0}
.ev{display:grid;grid-template-columns:3rem .75rem 1fr auto;align-items:baseline;gap:.5rem;padding:.35rem .25rem;border-bottom:1px solid var(--line)}
.ev time{color:var(--muted);font-variant-numeric:tabular-nums;font-size:.9rem}
.dot{display:inline-block;width:.55rem;height:.55rem;border-radius:50%;align-self:center}
.k-opened .dot{background:var(--opened)}.k-moved .dot{background:var(--moved)}.k-replied .dot{background:var(--replied)}.k-closed .dot{background:var(--closed)}
.what{min-width:0;overflow-wrap:anywhere}
.who{font-weight:600}
.who.others,.who.none{font-weight:500;font-style:italic;color:var(--muted)}
.state{font-weight:600}
.model{font-size:.75rem;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:0 .5rem;white-space:nowrap}
.fresh{animation:fresh 4s ease-out}
@keyframes fresh{from{background:var(--fresh)}to{background:transparent}}
.more{margin:1rem 0}
.empty{color:var(--muted)}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
@media (max-width:34rem){.ev{grid-template-columns:2.8rem .6rem 1fr}.ev .model{grid-column:3;justify-self:start}.net .node text{font-size:21px}.net .node.idle text{font-size:18px}}
`;
