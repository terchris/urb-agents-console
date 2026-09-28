import { expect, test } from "bun:test";
import { app } from "./app";

test("the health check answers", async () => {
  const r = await app.request("/healthz");
  expect(r.status).toBe(200);
  expect(await r.text()).toBe("ok");
});

test("the public feed is read-only, open to any origin, and says it is empty", async () => {
  const r = await app.request("/v1/events", { headers: { Origin: "https://example.org" } });
  expect(r.status).toBe(200);
  expect(r.headers.get("access-control-allow-origin")).toBe("*");
  const body = (await r.json()) as { schema: string; events: unknown[]; note: string };
  expect(body.schema).toBe("urb-events/1");
  expect(body.events).toEqual([]);
  expect(body.note).toContain("not built yet");
});

test("the frontend page renders", async () => {
  const r = await app.request("/");
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("The fleet, live");
});
