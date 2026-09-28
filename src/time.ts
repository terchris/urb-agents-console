// Time on the page: one display zone (TZ_DISPLAY, default Europe/Oslo), and the buckets the rhythm
// view counts events into, aligned to that zone's clock (whole hours, 00/06/12/18, midnights).
import type { Window } from "./api";

export const ZONE = process.env.TZ_DISPLAY ?? "Europe/Oslo";

const HOUR = 3_600_000;

/** The zone's offset from UTC at `t`, in ms (Oslo: +1 h in winter, +2 h in summer). */
export function offsetMs(t: number, zone = ZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * HOUR + Number(m[3]) * 60_000) : 0;
}

export const BUCKETS: Record<Window, { size: number; count: number; label: string }> = {
  "24h": { size: HOUR, count: 24, label: "hour" },
  "7d": { size: 6 * HOUR, count: 28, label: "6-hour block" },
  "30d": { size: 24 * HOUR, count: 30, label: "day" },
};

/**
 * The buckets for a window ending now: `count` fixed-size slots, the last one holding `now`, their
 * edges on the zone's clock. The size is fixed, so across a daylight-saving change a day bucket
 * runs an hour off local midnight until the next one; that is accepted, and it is only the edges.
 */
export function bucketsFor(window: Window, now: number, zone = ZONE): { size: number; starts: number[] } {
  const { size, count } = BUCKETS[window];
  const off = offsetMs(now, zone);
  const last = Math.floor((now + off) / size) * size - off; // the start of the bucket holding now
  return { size, starts: Array.from({ length: count }, (_, i) => last - (count - 1 - i) * size) };
}
