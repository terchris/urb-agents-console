// The rhythm view: when the fleet works and rests. One row per agent, one column per time bucket,
// darker is busier (one hue, light → dark: magnitude, not identity). Above it, the whole fleet as
// bars. Every cell has its count as a tooltip, and the same numbers are in the table beneath.
//
// Cells are binned on a √ scale into five steps, so a quiet hour next to a busy one still shows.
// An agent with no events in the window has no row; it is named in the line beneath instead, so
// "who idles" is visible too.
import type { FC } from "hono/jsx";
import { named, OTHERS } from "./allowlist";
import type { Window } from "./api";
import type { Href } from "./network-view";
import type { Activity } from "./store";
import { BUCKETS, ZONE } from "./time";

export type Rhythm = Activity & { window: Window; starts: number[]; size: number };

const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
const hourOnly = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short" });
const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short" });

/** 0 for none, else 1–5 on a √ scale of the busiest cell. */
export function bin(n: number, max: number): number {
  return n <= 0 || max <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(5 * Math.sqrt(n / max))));
}

/** A bucket in words, for tooltips: "Mon 28 Sep, 14:00–15:00". */
export function span(start: number, size: number, window: Window): string {
  if (window === "30d") return dayFmt.format(new Date(start));
  return `${dayFmt.format(new Date(start))}, ${hourFmt.format(new Date(start))}–${hourFmt.format(new Date(start + size))}`;
}

/** The axis: a label where the zone's clock turns (every 6 hours; every midnight; every Monday). */
export function tick(start: number, window: Window): string | null {
  const d = new Date(start);
  const h = Number(hourOnly.format(d));
  if (window === "24h") return h % 6 === 0 ? `${String(h).padStart(2, "0")}:00` : null;
  if (window === "7d") return h === 0 ? weekday.format(d) : null;
  return weekday.format(d) === "Mon" ? dayFmt.format(d).replace(/^\w+ /, "") : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const RhythmView: FC<{ r: Rhythm; agent?: string; href: Href }> = ({ r, agent, href }) => {
  const unit = BUCKETS[r.window].label;
  const maxCell = Math.max(0, ...r.agents.flatMap((a) => a.counts));
  const maxTotal = Math.max(0, ...r.total);
  const peak = r.total.indexOf(maxTotal);
  const quiet = [...named(), OTHERS].filter((id) => !r.agents.some((a) => a.id === id));
  return (
    <section aria-labelledby="rh" class="rhythm">
      <h2 id="rh">When the fleet works <small>per {unit}, last {r.window === "24h" ? "24 hours" : r.window === "7d" ? "7 days" : "30 days"}</small></h2>
      <p class="how">
        Each row is an agent and each column one {unit}; darker means more events it took part in. The bars on top are the whole fleet.
        {maxTotal > 0 ? <> The busiest {unit} was {span(r.starts[peak]!, r.size, r.window)}, with {plural(maxTotal, "event")}.</> : null}
      </p>
      <div class="rh" style={`--n:${r.starts.length}`}>
        <div class="rh-row rh-total">
          <span class="rh-name">All agents</span>
          <div class="rh-grid">
            {r.total.map((n, i) => (
              <span class="bar" data-tip={`All agents · ${span(r.starts[i]!, r.size, r.window)} · ${plural(n, "event")}`}>
                <i style={`height:${maxTotal ? Math.max(n ? 6 : 0, Math.round((100 * n) / maxTotal)) : 0}%`} />
              </span>
            ))}
          </div>
        </div>
        {r.agents.map((a) => (
          <div class={["rh-row", agent ? (a.id === agent ? "sel" : "dim") : ""].join(" ").trim()}>
            <a class={a.id === OTHERS ? "rh-name others" : "rh-name"} href={href({ agent: a.id === agent ? null : a.id })}>{a.id}</a>
            <div class="rh-grid">
              {a.counts.map((n, i) => (
                <span class={`c b${bin(n, maxCell)}`} data-tip={`${a.id} · ${span(r.starts[i]!, r.size, r.window)} · ${plural(n, "event")}`} />
              ))}
            </div>
          </div>
        ))}
        <div class="rh-row rh-axis" aria-hidden="true">
          <span />
          <div class="rh-grid">{r.starts.map((t) => <span>{tick(t, r.window)}</span>)}</div>
        </div>
      </div>
      <p class="rh-legend">
        <span>none</span><span class="c b0" /><span class="c b1" /><span class="c b2" /><span class="c b3" /><span class="c b4" /><span class="c b5" />
        <span>more (busiest: {plural(maxCell, "event")} in one {unit})</span>
      </p>
      {quiet.length ? <p class="rh-quiet">Quiet all window: {quiet.join(", ")}.</p> : null}
      <details class="twin">
        <summary>Show as a table</summary>
        <div class="scroll">
          <table>
            <thead>
              <tr><th scope="col">Agent</th>{r.starts.map((t) => <th scope="col" class="n">{span(t, r.size, r.window).replace(/^\w+ /, "")}</th>)}</tr>
            </thead>
            <tbody>
              <tr><th scope="row">All agents</th>{r.total.map((n) => <td class="n">{n}</td>)}</tr>
              {r.agents.map((a) => <tr><th scope="row">{a.id}</th>{a.counts.map((n) => <td class="n">{n}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
};

// Sequential blue, the dataviz reference ramp. Light: steps 150/250/400/550/700 (near zero recedes
// towards the surface). Dark: the anchor flips, 600/500/400/300/150, so near zero recedes towards
// the dark surface and the busiest is brightest.
export const RHYTHM_CSS = `
:root{--h0:#ece9e1;--h1:#b7d3f6;--h2:#86b6ef;--h3:#3987e5;--h4:#1c5cab;--h5:#0d366b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--h0:#24262d;--h1:#184f95;--h2:#256abf;--h3:#3987e5;--h4:#6da7ec;--h5:#b7d3f6}}
:root[data-theme="dark"]{--h0:#24262d;--h1:#184f95;--h2:#256abf;--h3:#3987e5;--h4:#6da7ec;--h5:#b7d3f6}
.rh{display:grid;gap:3px;margin:.5rem 0 0}
.rh-row{display:grid;grid-template-columns:10rem 1fr;align-items:center;gap:.5rem}
.rh-row.dim{opacity:.35}
.rh-row.sel .rh-name{color:var(--accent)}
.rh-name{font-size:.85rem;font-weight:600;color:var(--fg);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a.rh-name:hover{text-decoration:underline}
.rh-name.others{font-style:italic;font-weight:500;color:var(--muted)}
.rh-total .rh-name{color:var(--muted);font-weight:500}
.rh-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px}
.rh .c{height:18px;border-radius:2px}
.c.b0{background:var(--h0)}.c.b1{background:var(--h1)}.c.b2{background:var(--h2)}.c.b3{background:var(--h3)}.c.b4{background:var(--h4)}.c.b5{background:var(--h5)}
.rh .c:hover{outline:2px solid var(--fg);outline-offset:-1px}
.rh-total .bar{height:40px;display:flex;align-items:flex-end}
.rh-total .bar i{display:block;width:100%;background:var(--accent);border-radius:2px 2px 0 0}
.rh-total .bar:hover i{background:var(--fg)}
.rh-axis .rh-grid span{font-size:.7rem;color:var(--muted);white-space:nowrap;overflow:visible;height:1rem}
.rh-legend{display:flex;flex-wrap:wrap;align-items:center;gap:3px;font-size:.8rem;color:var(--muted);margin:.5rem 0 0}
.rh-legend .c{display:inline-block;width:14px;height:12px;border-radius:2px}
.rh-legend span:first-child{margin-right:.3rem}.rh-legend span:last-child{margin-left:.3rem}
.rh-quiet{font-size:.85rem;color:var(--muted);margin:.25rem 0 0}
.scroll{overflow-x:auto;max-width:100%}
.scroll table{max-width:none;width:auto}
.scroll th,.scroll td{white-space:nowrap;padding-right:.5rem}
@media (max-width:34rem){.rh-row{grid-template-columns:6.5rem 1fr}.rh .c{height:14px}.rh-axis .rh-grid span{font-size:.6rem}}
`;
