// The network view: who sends work to whom, drawn as SVG in Hono JSX on the server.
//
// Every agent is a link (select it: `?agent=`), so the view works without JavaScript and from the
// keyboard. Every connection carries its numbers as a tooltip (data-tip, and a <title> for
// assistive tech); the same numbers are in the table beneath, so nothing is hover-only.
// `data-pair` lets the page's script pulse a connection when a new event arrives on it.
import type { FC } from "hono/jsx";
import { OTHERS } from "./allowlist";
import type { Laid } from "./network";
import type { Profile } from "./directory";
import type { Link } from "./store";

export type Href = (p: { agent?: string | null; before?: string }) => string;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const linkText = (l: Link) =>
  `${l.from} → ${l.to}: ${plural(l.events, "event")} · ${plural(l.opened, "task")} opened · ${plural(l.replies, "reply", "replies")}`;

function anchor(angle: number): "start" | "middle" | "end" {
  const c = Math.cos(angle);
  return Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
}

/** `compact`: the phone drawing. Labels sit inside the circle, so long ids fit a narrow screen. */
export const NetworkSvg: FC<{ laid: Laid; agent?: string; href: Href; target?: string; active?: Set<string>; profiles?: ReadonlyMap<string, Profile>; compact?: boolean }> =
  ({ laid, agent, href, target, active, profiles, compact }) => {
  const pre = compact ? "c" : "w"; // clip-path ids must be unique on a page that draws both
  const { box, nodes, links } = laid;
  const touching = (l: Link) => agent !== undefined && (l.from === agent || l.to === agent);
  const neighbours = new Set(links.filter(touching).flatMap((l) => [l.from, l.to]));
  const top = [...links].sort((a, b) => b.events - a.events).slice(0, 3);
  return (
    <svg
      class={`net ${compact ? "net-compact" : "net-wide"}${agent ? " has-sel" : ""}`}
      viewBox={`0 0 ${box.width} ${box.height}`}
      role="img"
      aria-labelledby={`${pre}-net-title ${pre}-net-desc`}
    >
      <title id={`${pre}-net-title`}>Who sends work to whom</title>
      <desc id={`${pre}-net-desc`}>
        {links.length === 0
          ? "No tasks between agents in this window."
          : `${plural(links.length, "connection")}. Busiest: ${top.map(linkText).join("; ")}. The table below lists every connection.`}
      </desc>
      <g class="links">
        {links.map((l) => (
          <g class={touching(l) ? "link hot" : "link"} data-pair={`${l.from}>${l.to}`} data-tip={linkText(l)} style={`--w:${l.opacity}`}>
            <path class="hit" d={l.curve.d} />
            <path class="edge" d={l.curve.d} stroke-width={l.width} />
            <path class="head" d={l.curve.head} />
            <title>{linkText(l)}</title>
          </g>
        ))}
      </g>
      <g class="nodes">
        {nodes.map((n) => {
          const cls = ["node", n.events === 0 ? "idle" : "", n.id === OTHERS ? "others" : "",
            n.id === agent ? "sel" : "", agent && n.id !== agent && neighbours.has(n.id) ? "nb" : "",
            active?.has(n.id) ? "active" : ""].filter(Boolean).join(" ");
          const lx = n.x + Math.cos(n.angle) * (n.r + 8);
          const ly = n.y + Math.sin(n.angle) * (n.r + 8);
          const initials = n.id === OTHERS ? "…" : n.id.split("-").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
          const p = profiles?.get(n.id);
          const tip = `${n.id}${p?.role ? ` (${p.role})` : ""}: ${n.events === 0 ? "no events" : plural(n.events, "event")} in this window${active?.has(n.id) ? " · active now" : ""}`;
          return (
            <a href={href({ agent: n.id === agent ? null : n.id })} target={target} class={cls} data-tip={tip} aria-label={tip}>
              <circle class="hit" cx={n.x} cy={n.y} r={Math.max(n.r + 6, 14)} />
              {p?.avatar ? (
                <>
                  <clipPath id={`${pre}-av-${n.id}`}><circle cx={n.x} cy={n.y} r={n.r} /></clipPath>
                  <circle class="dot pic" cx={n.x} cy={n.y} r={n.r} />
                  <image href={p.avatar} x={n.x - n.r} y={n.y - n.r} width={n.r * 2} height={n.r * 2}
                    clip-path={`url(#${pre}-av-${n.id})`} preserveAspectRatio="xMidYMid slice" />
                  <circle class="ring" cx={n.x} cy={n.y} r={n.r} />
                </>
              ) : <circle class="dot" cx={n.x} cy={n.y} r={n.r} />}
              {compact
                ? (p?.avatar ? null : <text class="ini" x={n.x} y={n.y} text-anchor="middle" dominant-baseline="central">{initials}</text>)
                : <text x={Math.round(lx * 10) / 10} y={Math.round(ly * 10) / 10} text-anchor={anchor(n.angle)} dominant-baseline="middle">{n.id}</text>}
            </a>
          );
        })}
      </g>
    </svg>
  );
};

/** The phone's companion to the drawing: the busiest connections, readable at any width. */
export const TopPairs: FC<{ laid: Laid; agent?: string; profiles: ReadonlyMap<string, Profile>; face: FC<{ id: string | null; profiles: ReadonlyMap<string, Profile>; size: number }> }> =
  ({ laid, agent, profiles, face: Face }) => {
    const rows = [...laid.links].filter((l) => !agent || l.from === agent || l.to === agent).sort((a, b) => b.events - a.events).slice(0, 6);
    const max = Math.max(1, ...rows.map((l) => l.events));
    if (rows.length === 0) return null;
    return (
      <ol class="pairs" aria-label="Busiest connections">
        {rows.map((l) => (
          <li>
            <span class="p-who"><Face id={l.from} profiles={profiles} size={22} /><span>{l.from}</span><span class="arrow" aria-label="to">→</span><Face id={l.to} profiles={profiles} size={22} /><span>{l.to}</span></span>
            <span class="p-bar"><i style={`width:${Math.round((100 * l.events) / max)}%`} /></span>
            <span class="p-n">{l.events}</span>
          </li>
        ))}
      </ol>
    );
  };

/** The table twin: every connection, and each agent's tasks to itself, with the same numbers. */
export const NetworkTable: FC<{ laid: Laid; agent?: string }> = ({ laid, agent }) => {
  const rows = [...laid.links, ...laid.loops]
    .filter((l) => !agent || l.from === agent || l.to === agent)
    .sort((a, b) => b.events - a.events || a.from.localeCompare(b.from));
  return (
    <details class="twin">
      <summary>Show as a table ({plural(rows.length, "connection")})</summary>
      <table>
        <thead>
          <tr><th scope="col">From</th><th scope="col">To</th><th scope="col" class="n">Events</th><th scope="col" class="n">Tasks opened</th><th scope="col" class="n">Replies</th></tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr><td>{l.from}</td><td>{l.to}</td><td class="n">{l.events}</td><td class="n">{l.opened}</td><td class="n">{l.replies}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
};

/** In words, for the selected agent: whom it sends most to, and who sends most to it. */
export const Focus: FC<{ laid: Laid; agent: string; href: Href; profile?: Profile }> = ({ laid, agent, href, profile }) => {
  const all = [...laid.links, ...laid.loops];
  const out = all.filter((l) => l.from === agent && l.to !== agent).sort((a, b) => b.events - a.events).slice(0, 3);
  const inn = all.filter((l) => l.to === agent && l.from !== agent).sort((a, b) => b.events - a.events).slice(0, 3);
  const list = (ls: Link[], other: (l: Link) => string) =>
    ls.length === 0 ? <span class="muted">nobody</span>
      : ls.map((l, i) => <>{i > 0 ? ", " : null}<a href={href({ agent: other(l) })}>{other(l)}</a> ({i === 0 ? plural(l.events, "event") : l.events})</>);
  return (
    <p class="focus">
      {profile?.avatar && !profile.summary ? <img class="face" src={profile.avatar} alt="" width="28" height="28" /> : null}
      <b>{agent}</b>{profile?.role && !profile.summary ? <span class="muted">, {profile.role},</span> : null} sends most to {list(out, (l) => l.to)}, and gets most from {list(inn, (l) => l.from)}.{" "}
      {profile?.page && !profile.summary ? <><a href={profile.page}>About {agent}</a> · </> : null}<a href={href({ agent: null })}>Show everyone</a>
    </p>
  );
};
