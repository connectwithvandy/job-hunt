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

  test("owner uses what the tester leaves, up to 10, never more", async () => {
    const { owner, tester, reserve, totalUsed } = await setup();
    expect(await reserve(tester, 5)).toBe(5);
    expect(await reserve(owner, 10)).toBe(5);
    expect(await reserve(owner, 1)).toBe(0);
    expect(await reserve(tester, 1)).toBe(0);
    expect(await totalUsed()).toBe(10);
  });

  test("if the owner spends all 10 first, the tester gets none and the budget holds", async () => {
    const { owner, tester, reserve, totalUsed } = await setup();
    expect(await reserve(owner, 10)).toBe(10);
    expect(await reserve(tester, 5)).toBe(0);
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
    expect(await reserve(owner, 10)).toBe(4);
    expect(await totalUsed()).toBe(10);
  });
});
