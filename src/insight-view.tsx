// Four pieces taken from other consoles (docs/ai-developer/plans/active/PLAN-004-console-insights.md):
//
//   Summary     one sentence built from the numbers, never from text (Logfire's run summary, minus the AI)
//   Inventory   one sortable row per agent, with a sparkline and "active now" (Logfire's Agents view,
//               Conductor's "see at a glance")
//   Histogram   events over the window above the timeline, the part being read highlighted, each bar a
//               jump (Logfire's Live view)
//   AgentPicker the filter row's agent select, which "/" focuses (Logfire's keyboard)
//
// Everything is derived from what the page already has: the network, the agent summaries and the
// activity buckets. Nothing here reads anything new from the store.
import type { FC } from "hono/jsx";
import { ALLOWLIST, OTHERS } from "./allowlist";
import type { Event } from "./event";
import { layoutOrder, type Laid } from "./network";
import type { Href } from "./network-view";
import type { Rhythm } from "./rhythm-view";
import { span } from "./rhythm-view";
import type { AgentSummary } from "./store";

/** An agent with an event in the last ten minutes counts as active now. */
export const ACTIVE_MS = 10 * 60_000;

export function activeNow(agents: AgentSummary[], now: number): Set<string> {
  return new Set(agents.filter((a) => now - Date.parse(a.lastSeen) <= ACTIVE_MS).map((a) => a.id));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function top<T>(xs: T[], v: (x: T) => number): T | undefined {
  return xs.reduce<T | undefined>((best, x) => (v(x) > 0 && (!best || v(x) > v(best)) ? x : best), undefined);
}

export type SummaryInput = { agents: AgentSummary[]; network: Laid; total: number; windowLabel: string; now: number; agent?: string };

/** The page's headline in words, from counts only. */
export function summary({ agents, network, total, windowLabel, now, agent }: SummaryInput): string[] {
  const active = [...activeNow(agents, now)];
  const activeLine = active.length
    ? `Active in the last 10 minutes: ${active.join(", ")}.`
    : "Nobody has been active in the last 10 minutes.";
  if (total === 0) return [`Nothing on the bus in the last ${windowLabel}.`];
  const all = [...network.links, ...network.loops];
  if (agent) {
    const a = agents.find((x) => x.id === agent);
    const events = network.nodes.find((n) => n.id === agent)?.events ?? 0;
    if (!a || events === 0) return [`${agent} took no part in anything in the last ${windowLabel}.`, activeLine];
    const from = top(all.filter((l) => l.to === agent && l.from !== agent), (l) => l.opened);
    const to = top(all.filter((l) => l.from === agent && l.to !== agent), (l) => l.opened);
    const parts = [`${agent} took part in ${plural(events, "event")} in the last ${windowLabel}`];
    if (a.opened) parts.push(`opened ${plural(a.opened, "task")}${to ? `, most for ${to.to} (${to.opened})` : ""}`);
    if (a.received) parts.push(`received ${a.received}${from ? `, most from ${from.from} (${from.opened})` : ""}`);
    if (a.replied) parts.push(`wrote ${plural(a.replied, "reply", "replies")}`);
    const lines = [parts.join("; ") + "."];
    if (a.models[0]) lines.push(`It wrote mostly with ${a.models[0].name}.`);
    return [...lines, activeLine];
  }
  const busy = agents.filter((a) => a.id !== OTHERS);
  const sender = top(busy, (a) => a.opened), receiver = top(busy, (a) => a.received), replier = top(busy, (a) => a.replied);
  const pair = top(all.filter((l) => l.from !== l.to), (l) => l.events);
  // Agent ids are lower-case names, so no sentence may start with one.
  const bits = [
    sender && `opened the most tasks: ${sender.id} (${sender.opened})`,
    receiver && `received the most: ${receiver.id} (${receiver.received})`,
    replier && `wrote the most replies: ${replier.id} (${replier.replied})`,
  ].filter(Boolean);
  const taking = network.nodes.filter((n) => n.events > 0).length; // the layout places idle agents too
  const lines = [`In the last ${windowLabel}: ${plural(total, "event")} between ${plural(taking, "agent")}.`];
  if (bits.length) lines.push(`Who ${bits.join("; ")}.`);
  if (pair) lines.push(`The busiest connection was ${pair.from} → ${pair.to}, with ${plural(pair.events, "event")}.`);
  return [...lines, activeLine];
}

export const Summary: FC<{ lines: string[] }> = ({ lines }) => (
  <p class="summary">{lines.map((l, i) => <>{i ? " " : null}{l}</>)}</p>
);

/** A polyline over the counts, with the latest point marked. */
export const Sparkline: FC<{ counts: number[] }> = ({ counts }) => {
  const w = 96, h = 20, max = Math.max(1, ...counts), n = counts.length;
  if (n === 0) return <span class="spark none" />;
  const pts = counts.map((c, i) => [n === 1 ? w : (i * w) / (n - 1), h - 2 - (c / max) * (h - 4)] as const);
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={pts.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ")} />
      <circle cx={lx} cy={ly} r="2.5" />
    </svg>
  );
};

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export const Inventory: FC<{ agents: AgentSummary[]; network: Laid; rhythm: Rhythm; now: number; windowLabel: string; agent?: string; href: Href }> =
  ({ agents, network, rhythm, now, windowLabel, agent, href }) => {
    const events = new Map(network.nodes.map((n) => [n.id, n.events]));
    const counts = new Map(rhythm.agents.map((a) => [a.id, a.counts]));
    const active = activeNow(agents, now);
    const rows = [...agents].sort((a, b) => (events.get(b.id) ?? 0) - (events.get(a.id) ?? 0) || a.id.localeCompare(b.id));
    const zeros = rhythm.total.map(() => 0);
    return (
      <section aria-labelledby="ag">
        <h2 id="ag">Agents <small>last {windowLabel} · select a column to sort</small></h2>
        {rows.length === 0 ? <p class="empty">Nobody has been active in this window.</p> : (
          <div class="inv-wrap"><table class="inv" data-sortable>
            <thead>
              <tr>
                <th scope="col" aria-sort="none"><button type="button" data-sort="name">Agent</button></th>
                <th scope="col" class="c-spark">Activity</th>
                <th scope="col" class="n" aria-sort="descending"><button type="button" data-sort="events">Events</button></th>
                <th scope="col" class="n"><button type="button" data-sort="opened">Opened</button></th>
                <th scope="col" class="n c-recv"><button type="button" data-sort="received">Received</button></th>
                <th scope="col" class="n"><button type="button" data-sort="replied">Replies</button></th>
                <th scope="col" class="c-models">Models</th>
                <th scope="col" class="n"><button type="button" data-sort="seen">Last seen</button></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr class={[a.id === agent ? "sel" : "", a.id === OTHERS ? "others" : ""].join(" ").trim() || undefined}
                  data-name={a.id} data-events={events.get(a.id) ?? 0} data-opened={a.opened} data-received={a.received}
                  data-replied={a.replied} data-seen={Date.parse(a.lastSeen)}>
                  <th scope="row">
                    {active.has(a.id) ? <span class="now" title="Active in the last 10 minutes" /> : <span class="now off" />}
                    <a href={href({ agent: a.id === agent ? null : a.id })}>{a.id}</a>
                  </th>
                  <td class="c-spark"><Sparkline counts={counts.get(a.id) ?? zeros} /></td>
                  <td class="n">{events.get(a.id) ?? 0}</td>
                  <td class="n">{a.opened}</td>
                  <td class="n c-recv">{a.received}</td>
                  <td class="n">{a.replied}</td>
                  <td class="c-models">{a.models.length
                    ? <span data-tip={a.models.map((m) => `${m.name} (${m.events})`).join(" · ")}>{a.models[0]!.name}{a.models.length > 1 ? <span class="more"> +{a.models.length - 1}</span> : null}</span>
                    : <span class="muted">—</span>}</td>
                  <td class="n seen">{active.has(a.id) ? <b>active</b> : ago(a.lastSeen, now)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    );
  };

/** Events over the window, above the timeline. The buckets the timeline is showing are marked, and
 *  each bar links to the events at that time. Follows the selected agent, if any. */
export const Histogram: FC<{ rhythm: Rhythm; events: Event[]; agent?: string; href: Href; paged: boolean }> =
  ({ rhythm, events, agent, href, paged }) => {
    const counts = agent ? rhythm.agents.find((a) => a.id === agent)?.counts ?? rhythm.total.map(() => 0) : rhythm.total;
    if (counts.length === 0) return null;
    const max = Math.max(1, ...counts);
    const newest = events[0] ? Date.parse(events[0].at) : Infinity;
    const oldest = events.length ? Date.parse(events[events.length - 1]!.at) : Infinity;
    const shown = (t: number) => events.length > 0 && t + rhythm.size > oldest && t <= newest;
    const last = rhythm.starts.length - 1;
    return (
      <nav class="histo" aria-label="Jump to a time">
        {rhythm.starts.map((t, i) => {
          const tip = `${span(t, rhythm.size, rhythm.window)} · ${plural(counts[i]!, "event")}${shown(t) ? " · shown below" : ""}`;
          const to = i === last && !paged ? href({}) : href({ before: new Date(t + rhythm.size).toISOString() });
          return (
            <a href={to} class={shown(t) ? "on" : undefined} data-tip={tip} aria-label={tip}>
              <i style={`height:${counts[i] ? Math.max(8, Math.round((100 * counts[i]!) / max)) : 0}%`} />
            </a>
          );
        })}
      </nav>
    );
  };

/** The agent select in the filter row: a plain GET form, submitted on change by the page's script. */
export const AgentPicker: FC<{ window: string; agent?: string }> = ({ window, agent }) => (
  <form method="get" action="/" class="pick">
    {window !== "24h" ? <input type="hidden" name="window" value={window} /> : null}
    <label>
      <span>Follow</span>
      <select name="agent" id="agent-pick" aria-keyshortcuts="/">
        <option value="">everyone</option>
        {layoutOrder().filter((id) => ALLOWLIST.has(id) || id === OTHERS).map((id) => (
          <option value={id} selected={id === agent}>{id}</option>
        ))}
      </select>
    </label>
    <noscript><button type="submit">Go</button></noscript>
  </form>
);
