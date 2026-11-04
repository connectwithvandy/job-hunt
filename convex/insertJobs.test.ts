/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const job = (id: string, title: string, postedAt: string | undefined, source: "dreamwork" | "pasted" | "careers" = "dreamwork") => ({
  externalId: id,
  source,
  url: `https://example.com/${id}`,
  title,
  company: "Acme",
  location: "Bengaluru",
  postedAt,
  status: "new" as const,
  outreach: [],
  updatedAt: Date.now(),
});

test("searched jobs posted over 45 days ago aren't saved; fresh ones and ones you add are", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "p@example.com" }));
  const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const fresh = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { added } = await t.mutation(internal.jobs.insertMany, {
    userId,
    jobs: [job("a", "Account Executive", old), job("b", "Senior Account Executive", fresh), job("c", "Enterprise Account Executive", undefined), job("d", "Founding Account Executive", old, "pasted")],
  });
  expect(added).toBe(3);
  const titles = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).map((j) => j.title).sort());
  expect(titles).toEqual(["Enterprise Account Executive", "Founding Account Executive", "Senior Account Executive"]);
});

test("a careers-board role is kept however old, and the count matches what's saved", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "c@example.com" }));
  const old = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const first = await t.mutation(internal.jobs.insertMany, { userId, jobs: [job("e", "Strategic Account Executive", old, "careers"), job("f", "Account Executive", old)] });
  expect(first).toMatchObject({ added: 1, kept: 1 });
  // Seen again the next morning: nothing new, but it still counts as one open role.
  const again = await t.mutation(internal.jobs.insertMany, { userId, jobs: [job("e", "Strategic Account Executive", old, "careers")] });
  expect(again).toMatchObject({ added: 0, kept: 1 });
});

test("the first scoring after sign-up runs once, and never for someone who already has scores", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const fresh = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "new@example.com" });
    await ctx.db.insert("profiles", { userId, location: "Bengaluru", onboarded: true });
    return userId;
  });
  expect(await t.mutation(internal.jobs.claimFirstScoring, { userId: fresh })).toBe(true);
  expect(await t.mutation(internal.jobs.claimFirstScoring, { userId: fresh })).toBe(false);

  const seasoned = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "old@example.com" });
    await ctx.db.insert("profiles", { userId, location: "Bengaluru", onboarded: true });
    await ctx.db.insert("jobs", { userId, ...job("x", "Account Executive", undefined), scores: [{ trackKey: "ae", score: 80, reason: "", gaps: [] }] });
    return userId;
  });
  expect(await t.mutation(internal.jobs.claimFirstScoring, { userId: seasoned })).toBe(false);
});
