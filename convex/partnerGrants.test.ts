/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const FROM = Date.UTC(2026, 10, 10);
const UNTIL = Date.UTC(2027, 1, 10);
const deal = { name: "SaasPire", url: "https://saaspire.co/", from: FROM, until: UNTIL };

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

test("someone already signed up gets the partner plan straight away", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "early@example.com" });
    await ctx.db.insert("access", { userId, email: "early@example.com", approved: false });
  });
  const out = await t.mutation(internal.access.grantPartner, { people: [{ email: " Early@example.com ", firstName: "Early" }], ...deal });
  expect(out).toEqual([{ email: "early@example.com", status: "applied" }]);
  const row = await t.run(async (ctx) => await ctx.db.query("access").first());
  expect(row?.approved).toBe(true);
  expect(row?.paidUntil).toBe(UNTIL);
  expect(row?.partner?.name).toBe("SaasPire");
});

test("someone who signs up later gets it when they join, and a second run doesn't double up", async () => {
  const t = setup();
  expect(await t.mutation(internal.access.grantPartner, { people: [{ email: "late@example.com" }], ...deal })).toEqual([{ email: "late@example.com", status: "waiting for sign-up" }]);
  expect(await t.mutation(internal.access.grantPartner, { people: [{ email: "late@example.com" }], ...deal })).toEqual([{ email: "late@example.com", status: "already granted" }]);
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "late@example.com" }));
  await t.withIdentity({ subject: `${userId}|session` }).mutation(api.access.join, {});
  const row = await t.run(async (ctx) => await ctx.db.query("access").first());
  expect(row?.approved).toBe(true);
  expect(row?.paidUntil).toBe(UNTIL);
  const status = await t.withIdentity({ subject: `${userId}|session` }).query(api.payments.status, {});
  expect(status.partner?.url).toBe("https://saaspire.co/");
});

test("other people joining get nothing extra", async () => {
  const t = setup();
  await t.mutation(internal.access.grantPartner, { people: [{ email: "late@example.com" }], ...deal });
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "someone@example.com" }));
  await t.withIdentity({ subject: `${userId}|session` }).mutation(api.access.join, {});
  const row = await t.run(async (ctx) => await ctx.db.query("access").first());
  expect(row?.approved).toBe(false);
  expect(row?.paidUntil).toBeUndefined();
});

test("the partner welcome greets them by name and links to create an account", async () => {
  const { partnerWelcomeEmail } = await import("./lib/email");
  const mail = partnerWelcomeEmail({ email: "daya@example.com", firstName: "Daya", name: "SaasPire", url: "https://saaspire.co/", signedUp: false });
  expect(mail.subject).toBe("Daya, your SaasPire job hunt starts here");
  expect(mail.text).toContain("Create your account with daya@example.com");
  expect(mail.text).not.toContain("signin=1");
  expect(mail.text).not.toMatch(/\bAE\b|Feb/);
});

test("joining after a grant doesn't also send the usual welcome", async () => {
  const t = setup();
  await t.mutation(internal.access.grantPartner, { people: [{ email: "late@example.com" }], ...deal });
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "late@example.com" }));
  await t.withIdentity({ subject: `${userId}|session` }).mutation(api.access.join, {});
  const row = await t.run(async (ctx) => await ctx.db.query("access").first());
  expect(row?.welcomedAt).toBeTypeOf("number");
});
