import { expect, test } from "bun:test";
import { bin, span, tick } from "./rhythm-view";

// ICU data differs between Bun releases: en-GB September is "Sep" in 1.4.0 and "Sept" in 1.4.2
// (the image and CI). Either is right; the tests must not depend on which.
const MONDAY = /^28 Sept?$/;

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
  expect(tick(Date.parse("2026-09-27T22:00:00Z"), "30d")).toMatch(MONDAY); // a Monday
  expect(tick(Date.parse("2026-09-28T22:00:00Z"), "30d")).toBeNull();     // Tuesday
});

test("a bucket in words", () => {
  expect(span(Date.parse("2026-09-28T12:00:00Z"), 3_600_000, "24h")).toMatch(/^Mon 28 Sept?, 14:00–15:00$/);
  expect(span(Date.parse("2026-09-27T22:00:00Z"), 86_400_000, "30d")).toMatch(/^Mon 28 Sept?$/);
});
