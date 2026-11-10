/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const job = (id: string) => ({
  externalId: id,
  source: "pasted" as const,
  url: `https://example.com/${id}`,
  title: "Account Executive",
  company: `Acme ${id}`,
  location: "Bengaluru",
  postedAt: new Date().toISOString(),
  status: "new" as const,
  outreach: [],
  updatedAt: Date.now(),
});

const totals = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const r = await ctx.db.query("usageTotals").first();
    return r && { jobs: r.jobs, scored: r.scored, tailored: r.tailored, applied: r.applied };
  });

test("the recount sets a person's totals, and adding jobs keeps them up to date after that", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "p@example.com" }));
  await t.mutation(internal.jobs.insertMany, { userId, jobs: [job("a"), job("b")] });
  // A new member's totals start with their first jobs, before any recount.
  expect(await totals(t)).toEqual({ jobs: 2, scored: 0, tailored: 0, applied: 0 });
  await t.mutation(internal.stats.recountPerson, { userId, cursor: null, sum: { jobs: 0, scored: 0, tailored: 0, applied: 0 } });
  expect(await totals(t)).toEqual({ jobs: 2, scored: 0, tailored: 0, applied: 0 });
  // Changed through a JobPipe mutation: the totals follow without a recount.
  await t.mutation(internal.jobs.insertMany, { userId, jobs: [job("c")] });
  expect(await totals(t)).toEqual({ jobs: 3, scored: 0, tailored: 0, applied: 0 });
});
