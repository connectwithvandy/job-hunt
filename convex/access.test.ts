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
