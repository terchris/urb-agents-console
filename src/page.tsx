// The page at fleet.<domain>: Hono JSX, rendered on the server from the store (never the bus).
//
// It works without JavaScript: the timeline pages with an ordinary link (?before=<cursor>). With
// JavaScript, a small inline script fetches /partials/live every 30 s and swaps it in, marking the
// rows it has not shown before. The partial is this same JSX, so there is one markup, not two.
//
// Times are rendered in one zone on the server (TZ_DISPLAY, default Europe/Oslo) and say so, so
// the page is correct without a script.
import type { FC } from "hono/jsx";
import { OTHERS } from "./allowlist";
import type { Event } from "./event";
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
  <li class={`ev k-${e.kind}`} data-id={e.id}>
    <time datetime={e.at}>{timeFmt.format(new Date(e.at))}</time>
    <span class="dot" aria-hidden="true" />
    <span class="what"><What e={e} /></span>
    {e.model ? <span class="model" title={e.provider ?? undefined}>{e.model}</span> : null}
  </li>
);

const Timeline: FC<{ events: Event[]; now: number; next: string | null }> = ({ events, now, next }) => {
  const days: [string, Event[]][] = [];
  for (const e of events) {
    const label = dayLabel(e.at, now);
    const last = days[days.length - 1];
    if (last && last[0] === label) last[1].push(e);
    else days.push([label, [e]]);
  }
  return (
    <section aria-labelledby="tl">
      <h2 id="tl">Timeline</h2>
      {events.length === 0 ? <p class="empty">No events yet.</p> : null}
      {days.map(([label, evs]) => (
        <>
          <h3 class="day">{label}</h3>
          <ol class="events">{evs.map((e) => <Row e={e} />)}</ol>
        </>
      ))}
      {next ? <p class="more"><a href={`/?before=${encodeURIComponent(next)}`}>Older events →</a></p> : null}
    </section>
  );
};

const Agents: FC<{ agents: AgentSummary[]; now: number }> = ({ agents, now }) => (
  <section aria-labelledby="ag">
    <h2 id="ag">Agents <small>last 24 hours</small></h2>
    {agents.length === 0 ? <p class="empty">Nobody has been active in the last 24 hours.</p> : (
      <ul class="agents">
        {agents.map((a) => (
          <li class={a.id === OTHERS ? "agent others" : "agent"}>
            <span class="name">{a.id}</span>
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

export type LiveProps = { events: Event[]; agents: AgentSummary[]; total: number; now: number; next: string | null; paged: boolean };

/** The part the script refreshes. */
export const Live: FC<LiveProps> = ({ events, agents, total, now, next, paged }) => {
  const newest = events[0];
  return (
    <div id="live" data-paged={paged ? "1" : "0"}>
      <p class="pulse" role="status">
        <span class="live-dot" aria-hidden="true" />
        {paged ? "Older events" : newest ? <>Last event {ago(newest.at, now)} · {total} events in the last 24 hours</> : "Waiting for the first event"}
      </p>
      {paged ? null : <Agents agents={agents} now={now} />}
      <Timeline events={events} now={now} next={next} />
    </div>
  );
};

export const Page: FC<LiveProps & { note?: string }> = (p) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>The fleet, live</title>
      <meta name="description" content="What the Urbalurba agent fleet is doing on its bus, close to real time." />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <main>
        <header>
          <h1>The fleet, live</h1>
          <p class="lede">What the Urbalurba agents are saying to each other on their bus, about a minute behind.</p>
          {p.note ? <p class="note">{p.note}</p> : null}
        </header>
        <Live {...p} />
        <footer>
          <p>
            Shown: when, the task's sender and recipient, who replied, the new state, and the model that wrote it
            where the bus records one. Never a task's title, body or number.
            Agents that are not on the public list appear as <i>others</i>. Times are {ZONE.replace("_", " ")} time.
          </p>
          <p>The same data as JSON: <a href="/v1/events">/v1/events</a> · <a href="/v1/openapi.json">OpenAPI 3.1</a></p>
        </footer>
      </main>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </body>
  </html>
);

// Refresh the live part every 30 s, unless the reader is paging back through history.
const SCRIPT = `(() => {
  const seen = new Set([...document.querySelectorAll("#live .ev")].map((e) => e.dataset.id));
  async function tick() {
    const live = document.getElementById("live");
    if (!live || live.dataset.paged === "1" || document.hidden) return;
    try {
      const r = await fetch("/partials/live", { headers: { accept: "text/html" } });
      if (!r.ok) return;
      const t = document.createElement("template");
      t.innerHTML = await r.text();
      const fresh = t.content.getElementById("live");
      if (!fresh) return;
      for (const e of fresh.querySelectorAll(".ev")) {
        if (!seen.has(e.dataset.id)) { e.classList.add("fresh"); seen.add(e.dataset.id); }
      }
      live.replaceWith(fresh);
    } catch {}
  }
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", tick);
})();`;

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a64;--line:#e6e3da;--card:#ffffff;--accent:#2f5d8a;
  --opened:#2f6fb0;--moved:#b07a16;--replied:#2e8a55;--closed:#7a5aa6;--fresh:#fff4c2}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15161a;--fg:#ecebe6;--muted:#9a9a94;--line:#2a2c33;--card:#1c1e24;--accent:#8db6e0;
  --opened:#6fa8e6;--moved:#e0b04a;--replied:#5fc48a;--closed:#b597e0;--fresh:#3a3520}}
:root[data-theme="dark"]{--bg:#15161a;--fg:#ecebe6;--muted:#9a9a94;--line:#2a2c33;--card:#1c1e24;--accent:#8db6e0;
  --opened:#6fa8e6;--moved:#e0b04a;--replied:#5fc48a;--closed:#b597e0;--fresh:#3a3520}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:56rem;margin:0 auto;padding:2.5rem 16px 4rem}
h1{font-size:1.9rem;margin:0 0 .25rem;letter-spacing:-.01em}
h2{font-size:1rem;margin:2rem 0 .75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
h2 small{text-transform:none;letter-spacing:0;font-weight:400;margin-left:.4rem}
h3.day{font-size:.95rem;margin:1.5rem 0 .25rem;color:var(--muted);font-weight:600}
a{color:var(--accent)}
.lede{margin:0;color:var(--muted)}
.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.6rem .8rem}
.pulse{display:flex;align-items:center;gap:.5rem;margin:1.25rem 0 0;color:var(--muted);font-size:.9rem}
.live-dot{flex-shrink:0;width:.55rem;height:.55rem;border-radius:50%;background:var(--replied);box-shadow:0 0 0 0 var(--replied);animation:pulse 2.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--replied) 60%,transparent)}70%{box-shadow:0 0 0 .5rem transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.live-dot{animation:none}}
.agents{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(12.5rem,100%),1fr));gap:.5rem}
.agent{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.55rem .7rem;display:grid;grid-template-columns:1fr auto;gap:.1rem .5rem}
.agent .name{font-weight:600;overflow-wrap:anywhere}
.agent .seen{color:var(--muted);font-size:.8rem;white-space:nowrap}
.agent .counts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.2rem .7rem;color:var(--muted);font-size:.8rem}
.agent.others{border-style:dashed}
.agent.others .name{font-style:italic;font-weight:500}
.events{list-style:none;padding:0;margin:0}
.ev{display:grid;grid-template-columns:3rem .75rem 1fr auto;align-items:baseline;gap:.5rem;padding:.35rem .25rem;border-bottom:1px solid var(--line)}
.ev time{color:var(--muted);font-variant-numeric:tabular-nums;font-size:.9rem}
.ev .dot{width:.55rem;height:.55rem;border-radius:50%;align-self:center}
.k-opened .dot{background:var(--opened)}.k-moved .dot{background:var(--moved)}.k-replied .dot{background:var(--replied)}.k-closed .dot{background:var(--closed)}
.what{min-width:0;overflow-wrap:anywhere}
.who{font-weight:600}
.who.others,.who.none{font-weight:500;font-style:italic;color:var(--muted)}
.state{font-weight:600}
.k-moved .state{color:var(--moved)}.k-closed .state{color:var(--closed)}
.model{font-size:.75rem;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:0 .5rem;white-space:nowrap}
.fresh{animation:fresh 4s ease-out}
@keyframes fresh{from{background:var(--fresh)}to{background:transparent}}
.more{margin:1rem 0}
.empty{color:var(--muted)}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
@media (max-width:34rem){.ev{grid-template-columns:2.8rem .6rem 1fr}.ev .model{grid-column:3;justify-self:start}}
`;
