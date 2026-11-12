/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { subscriberEmail, unsubscribeLink } from "./lib/email";
import { readSignup } from "./subscribers";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

test("sign-up input is cleaned: lowercase email, up to 3 distinct titles, a default place", () => {
  expect(readSignup({ email: " Asha@Example.com ", titles: ["SDR Manager", "sdr manager", " AE ", "BDR", "Head of Sales"], location: "" })).toEqual({
    email: "asha@example.com",
    titles: ["SDR Manager", "AE", "BDR"],
    location: "India",
  });
  expect(() => readSignup({ email: "nope", titles: ["SDR"], location: "Pune" })).toThrow("email");
  expect(() => readSignup({ email: "a@b.co", titles: [" "], location: "Pune" })).toThrow("job title");
});

test("signing up twice updates the same row and turns it back on; the link unsubscribes", async () => {
  vi.useFakeTimers();
  const t = setup();
  await t.mutation(api.subscribers.subscribe, { email: "a@example.com", titles: ["SDR"], location: "Pune" });
  const [row] = await t.run(async (ctx) => await ctx.db.query("subscribers").collect());
  expect(row.titles).toEqual(["SDR"]);
  expect(await t.mutation(internal.subscribers.unsubscribe, { key: row.key })).toBe(true);
  expect((await t.query(internal.subscribers.active, {})).length).toBe(0);
  await t.mutation(api.subscribers.subscribe, { email: "A@example.com", titles: ["AE", "BDR"], location: "Mumbai" });
  const rows = await t.run(async (ctx) => await ctx.db.query("subscribers").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ titles: ["AE", "BDR"], location: "Mumbai" });
  expect(rows[0].off).toBeUndefined();
  expect(await t.mutation(internal.subscribers.unsubscribe, { key: "wrong" })).toBe(false);
  vi.useRealTimers();
});

test("a member's key turns off their daily email", async () => {
  const t = setup();
  const accessId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "m@example.com" });
    return await ctx.db.insert("access", { userId, email: "m@example.com", approved: true });
  });
  const key = await t.mutation(internal.subscribers.memberKey, { accessId });
  expect(await t.mutation(internal.subscribers.memberKey, { accessId })).toBe(key);
  expect(await t.mutation(internal.subscribers.unsubscribe, { key })).toBe(true);
  expect((await t.run(async (ctx) => await ctx.db.get("access", accessId)))?.alertsOff).toBe(true);
});

test("the subscriber email groups by title, links to the company, and has one-click unsubscribe", () => {
  const { url, headers } = unsubscribeLink("abc123");
  expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  const mail = subscriberEmail({
    email: "a@example.com",
    place: "Bengaluru",
    unsubscribeUrl: url,
    groups: [
      { title: "SDR Manager", jobs: [{ title: "SDR Manager", company: "Acme", where: "Bengaluru", url: "https://jobs.acme.com/1" }, { title: "Manager, SDR", company: "Beta", where: "Bengaluru", url: "https://beta.io/2" }] },
      { title: "AE", jobs: [{ title: "Account Executive", company: "Gamma", where: "Bengaluru", url: "https://g.co/3" }] },
    ],
  });
  expect(mail.subject).toBe("SDR Manager: 2 new jobs, plus 1 more");
  expect(mail.text).toContain("https://jobs.acme.com/1");
  expect(mail.text).toContain("Unsubscribe in one click: https://jobpipe.in/unsubscribe?k=abc123");
  expect(mail.text).toContain("free for 7 days");
  const first = subscriberEmail({ email: "a@example.com", place: "Pune", unsubscribeUrl: url, groups: [{ title: "SDR", jobs: [] }], first: true });
  expect(first.subject).toBe("You're signed up for new sales jobs");
});
