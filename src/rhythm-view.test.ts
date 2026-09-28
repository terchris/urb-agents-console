import { expect, test } from "bun:test";
import { bin, span, tick } from "./rhythm-view";

test("cells bin on a square-root scale into five steps, and zero stays empty", () => {
  expect(bin(0, 100)).toBe(0);
  expect(bin(1, 100)).toBe(1);   // a quiet hour still shows
  expect(bin(4, 100)).toBe(1);
  expect(bin(5, 100)).toBe(2);
  expect(bin(100, 100)).toBe(5);
  expect(bin(3, 0)).toBe(0);
});

test("the axis labels where Oslo's clock turns", () => {
  expect(tick(Date.parse("2026-09-28T04:00:00Z"), "24h")).toBe("06:00"); // 06:00 in Oslo
  expect(tick(Date.parse("2026-09-28T05:00:00Z"), "24h")).toBeNull();
  expect(tick(Date.parse("2026-09-27T22:00:00Z"), "7d")).toBe("Mon");    // Oslo midnight
  expect(tick(Date.parse("2026-09-27T22:00:00Z"), "30d")).toBe("28 Sep"); // a Monday
  expect(tick(Date.parse("2026-09-28T22:00:00Z"), "30d")).toBeNull();     // Tuesday
});

test("a bucket in words", () => {
  expect(span(Date.parse("2026-09-28T12:00:00Z"), 3_600_000, "24h")).toBe("Mon 28 Sep, 14:00–15:00");
  expect(span(Date.parse("2026-09-27T22:00:00Z"), 86_400_000, "30d")).toBe("Mon 28 Sep");
});
