/// <reference types="vite/client" />
// Google Jobs' free monthly searches are shared fairly: each tester gets an even share,
// the owner can use what's left, and the whole app never goes over the monthly budget.
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const OWNER = "owner@example.com";

beforeEach(() => {
  process.env.OWNER_EMAILS = OWNER;
  process.env.JSEARCH_MONTHLY = "10";
});
afterEach(() => {
  delete process.env.JSEARCH_MONTHLY;
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const { owner, tester } = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: OWNER });
    const tester = await ctx.db.insert("users", { email: "tester@example.com" });
    await ctx.db.insert("access", { userId: tester, email: "tester@example.com", approved: true });
    return { owner, tester };
  });
  const reserve = (userId: typeof owner, want: number) => t.mutation(internal.limits.reserveGoogle, { userId, want });
  const totalUsed = () => t.run(async (ctx) => (await ctx.db.query("googleUsage").collect()).reduce((n, r) => n + r.count, 0));
  return { t, owner, tester, reserve, totalUsed };
}

describe("C. Google Jobs monthly share (budget 10, owner + 1 tester)", () => {
  test("tester gets at most 5 in total, however they ask", async () => {
    const { tester, reserve, totalUsed } = await setup();
    expect(await reserve(tester, 3)).toBe(3);
    expect(await reserve(tester, 5)).toBe(2);
    expect(await reserve(tester, 1)).toBe(0);
    expect(await totalUsed()).toBe(5);
  });

  test("tester asking for more than the share in one go gets the share", async () => {
    const { tester, reserve } = await setup();
    expect(await reserve(tester, 50)).toBe(5);
    expect(await reserve(tester, 50)).toBe(0);
  });

  test("owner and tester each get their share, never more", async () => {
    const { owner, tester, reserve, totalUsed } = await setup();
    expect(await reserve(tester, 5)).toBe(5);
    expect(await reserve(owner, 10)).toBe(5);
    expect(await reserve(owner, 1)).toBe(0);
    expect(await reserve(tester, 1)).toBe(0);
    expect(await totalUsed()).toBe(10);
  });

  test("the owner can't use up everyone else's share", async () => {
    const { owner, tester, reserve, totalUsed } = await setup();
    expect(await reserve(owner, 10)).toBe(5);
    expect(await reserve(tester, 5)).toBe(5);
    expect(await totalUsed()).toBe(10);
  });

  test("a waiting (unapproved) person doesn't shrink the tester's share", async () => {
    const { t, tester, reserve } = await setup();
    await t.run(async (ctx) => {
      const w = await ctx.db.insert("users", { email: "wait@example.com" });
      await ctx.db.insert("access", { userId: w, email: "wait@example.com", approved: false });
    });
    expect(await reserve(tester, 10)).toBe(5);
  });

  test("a second approved tester splits it three ways (3 each)", async () => {
    const { t, tester, owner, reserve, totalUsed } = await setup();
    const second = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "two@example.com" });
      await ctx.db.insert("access", { userId: id, email: "two@example.com", approved: true });
      return id;
    });
    expect(await reserve(tester, 10)).toBe(3);
    expect(await reserve(second, 10)).toBe(3);
    expect(await reserve(owner, 10)).toBe(3);
    expect(await totalUsed()).toBe(9);
  });
});

describe("D. The whole app's daily AI limit", () => {
  beforeEach(() => {
    process.env.AI_DAILY_UNITS = "20";
  });
  afterEach(() => {
    delete process.env.AI_DAILY_UNITS;
  });

  test("stops AI work for everyone at the limit, but search stays open", async () => {
    const { t, tester } = await setup();
    const other = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "other@example.com" });
      await ctx.db.insert("access", { userId: id, email: "other@example.com", approved: true });
      return id;
    });
    await t.mutation(internal.limits.consume, { userId: tester, kind: "tailor" });
    await t.mutation(internal.limits.consume, { userId: tester, kind: "score", count: 5 });
    await expect(t.mutation(internal.limits.consume, { userId: other, kind: "score" })).rejects.toThrow("reached today's limit");
    await expect(t.mutation(internal.limits.consume, { userId: other, kind: "score", checkOnly: true })).rejects.toThrow("reached today's limit");
    await t.mutation(internal.limits.consume, { userId: other, kind: "search" });
  });

  test("a check alone uses nothing, and the owner isn't stopped", async () => {
    const { t, tester, owner } = await setup();
    for (let i = 0; i < 3; i++) await t.mutation(internal.limits.consume, { userId: tester, kind: "tailor", checkOnly: true });
    await t.mutation(internal.limits.consume, { userId: tester, kind: "tailor" });
    await t.mutation(internal.limits.consume, { userId: tester, kind: "score", count: 5 });
    await t.mutation(internal.limits.consume, { userId: owner, kind: "tailor" });
  });

  test("the health numbers show what's been used", async () => {
    const { t, tester } = await setup();
    await t.mutation(internal.limits.consume, { userId: tester, kind: "tailor" });
    const f = await t.query(internal.stats.healthFacts, { now: Date.now() });
    expect(f.aiUsed).toBe(15);
    expect(f.aiLimit).toBe(20);
    expect(f.letIn).toBe(1);
  });
});

describe("E. The free plan after the trial", () => {
  async function ended(t: Awaited<ReturnType<typeof setup>>["t"], paidUntil?: number) {
    return await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "free@example.com" });
      await ctx.db.insert("access", { userId: id, email: "free@example.com", approved: true, decidedAt: Date.now() - 11 * 86_400_000, paidUntil });
      return id;
    });
  }

  test("5 scores a day, then a pass message", async () => {
    const { t } = await setup();
    const free = await ended(t);
    await t.mutation(internal.limits.consume, { userId: free, kind: "score", count: 4 });
    await t.mutation(internal.limits.consume, { userId: free, kind: "score", checkOnly: true });
    await t.mutation(internal.limits.consume, { userId: free, kind: "score" });
    await expect(t.mutation(internal.limits.consume, { userId: free, kind: "score" })).rejects.toThrow("Week Pass");
  });

  test("1 tailored CV a week and 2 added jobs a day", async () => {
    const { t } = await setup();
    const free = await ended(t);
    await t.mutation(internal.limits.consume, { userId: free, kind: "tailor" });
    await expect(t.mutation(internal.limits.consume, { userId: free, kind: "tailor" })).rejects.toThrow("1 tailored CV a week");
    await t.mutation(internal.limits.consume, { userId: free, kind: "addJob", count: 2 });
    await expect(t.mutation(internal.limits.consume, { userId: free, kind: "addJob" })).rejects.toThrow("Week Pass");
  });

  test("research, prep, notes, chat and email lookups need a pass; search stays open", async () => {
    const { t } = await setup();
    const free = await ended(t);
    for (const kind of ["research", "prep", "notes", "chat", "findEmail"] as const) {
      await expect(t.mutation(internal.limits.consume, { userId: free, kind })).rejects.toThrow("part of the paid plan");
    }
    await t.mutation(internal.limits.consume, { userId: free, kind: "search" });
    await t.mutation(internal.limits.consume, { userId: free, kind: "readCv" });
    expect(await t.query(internal.limits.onFreePlan, { userId: free })).toBe(true);
  });

  test("paying lifts the free limits", async () => {
    const { t } = await setup();
    const paid = await ended(t, Date.now() + 86_400_000);
    await t.mutation(internal.limits.consume, { userId: paid, kind: "tailor", count: 2 });
    await t.mutation(internal.limits.consume, { userId: paid, kind: "research" });
    expect(await t.query(internal.limits.onFreePlan, { userId: paid })).toBe(false);
  });
});
