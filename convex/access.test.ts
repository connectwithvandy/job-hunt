/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function joiner(extra: { rejected?: boolean } = {}) {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email: "new@example.com" });
    await ctx.db.insert("access", { userId: id, email: "new@example.com", approved: false, ...extra });
    return id;
  });
  const as = t.withIdentity({ subject: `${userId}|session` });
  const row = () => t.run(async (ctx) => await ctx.db.query("access").first());
  return { as, row };
}

test("picking a sales role lets you in straight away, with the trial starting now", async () => {
  const { as, row } = await joiner();
  const letIn = await as.mutation(api.access.describe, { name: "Priya", linkedin: "", role: "SDR / BDR" });
  expect(letIn).toBe(true);
  const r = await row();
  expect(r?.approved).toBe(true);
  expect(r?.decidedAt).toBeTypeOf("number");
  expect(r?.role).toBe("SDR / BDR");
});

test("picking Other waits for the owner", async () => {
  const { as, row } = await joiner();
  expect(await as.mutation(api.access.describe, { name: "Sam", linkedin: "linkedin.com/in/sam", role: "Other" })).toBe(false);
  expect((await row())?.approved).toBe(false);
});

test("the role is required", async () => {
  const { as } = await joiner();
  await expect(as.mutation(api.access.describe, { name: "Sam", linkedin: "", role: " " })).rejects.toThrow("Pick the role");
});

test("someone the owner turned down is not let in by picking a sales role", async () => {
  const { as, row } = await joiner({ rejected: true });
  expect(await as.mutation(api.access.describe, { name: "Sam", linkedin: "", role: "Account Executive" })).toBe(false);
  expect((await row())?.approved).toBe(false);
});

test("the owner can add and clear paid time, and nobody else can", async () => {
  process.env.OWNER_EMAILS = "owner@example.com";
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const { owner, accessId, tester } = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "owner@example.com" });
    const tester = await ctx.db.insert("users", { email: "new@example.com" });
    const accessId = await ctx.db.insert("access", { userId: tester, email: "new@example.com", approved: true });
    return { owner, accessId, tester };
  });
  await expect(t.withIdentity({ subject: `${tester}|s` }).mutation(api.access.addPaidTime, { accessId })).rejects.toThrow("Only the owner");
  await expect(t.withIdentity({ subject: `${tester}|s` }).mutation(api.access.clearPaidTime, { accessId })).rejects.toThrow("Only the owner");
  const as = t.withIdentity({ subject: `${owner}|s` });
  const first = await as.mutation(api.access.addPaidTime, { accessId });
  expect(first).toBeGreaterThan(Date.now() + 89 * 86_400_000);
  // A second click adds on, so nobody loses days.
  expect(await as.mutation(api.access.addPaidTime, { accessId })).toBeGreaterThan(first + 89 * 86_400_000);
  await as.mutation(api.access.clearPaidTime, { accessId });
  expect((await t.run(async (ctx) => await ctx.db.get("access", accessId)))?.paidUntil).toBeUndefined();
});
