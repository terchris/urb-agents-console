import { expect, test } from "bun:test";
import { bucketsFor, offsetMs } from "./time";

test("Oslo is UTC+2 in summer and UTC+1 in winter", () => {
  expect(offsetMs(Date.parse("2026-07-01T12:00:00Z"), "Europe/Oslo")).toBe(2 * 3_600_000);
  expect(offsetMs(Date.parse("2026-01-01T12:00:00Z"), "Europe/Oslo")).toBe(3_600_000);
  expect(offsetMs(Date.parse("2026-01-01T12:00:00Z"), "UTC")).toBe(0);
});

test("the last bucket holds now, and the edges sit on the zone's clock", () => {
  const now = Date.parse("2026-09-28T19:47:00Z"); // 21:47 in Oslo
  const h = bucketsFor("24h", now, "Europe/Oslo");
  expect(h.starts).toHaveLength(24);
  expect(new Date(h.starts[23]!).toISOString()).toBe("2026-09-28T19:00:00.000Z");
  const six = bucketsFor("7d", now, "Europe/Oslo");
  expect(six.starts).toHaveLength(28);
  expect(new Date(six.starts[27]!).toISOString()).toBe("2026-09-28T16:00:00.000Z"); // 18:00 Oslo
  const day = bucketsFor("30d", now, "Europe/Oslo");
  expect(new Date(day.starts[29]!).toISOString()).toBe("2026-09-27T22:00:00.000Z"); // Oslo midnight
  for (const b of [h, six, day]) expect(now - b.starts[b.starts.length - 1]!).toBeLessThan(b.size);
});
