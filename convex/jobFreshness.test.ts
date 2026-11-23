/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const role = (externalId: string, company = "Acme") => ({ externalId, company, title: "Account Executive", location: "Bengaluru", url: `https://example.com/${externalId}`, india: true });

test("old LinkedIn roles past the first page are found too", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  // 2,500 old ones (more than one page) then one new one.
  await t.run(async (ctx) => {
    for (let i = 0; i < 2500; i++) await ctx.db.insert("careerJobs", role(`linkedin:${String(i).padStart(5, "0")}`));
  });
  vi.advanceTimersByTime(40 * 86_400_000);
  await t.run(async (ctx) => {
    await ctx.db.insert("careerJobs", role("linkedin:99999"));
    await ctx.db.insert("careerJobs", role("greenhouse:acme:1"));
  });
  const before = Date.now() - 30 * 86_400_000;
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page: { ids: string[]; cursor: string | null } = await t.query(internal.careers.oldPooledPage, { prefix: "linkedin:", before, cursor });
    ids.push(...page.ids);
    cursor = page.cursor;
  } while (cursor);
  expect(ids.length).toBe(2500);
  expect(ids).not.toContain("linkedin:99999");
  vi.useRealTimers();
});

test("a board starts its count when first seen, and goes stale after days without a read", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  // First sight: nothing is stale yet.
  expect(await t.mutation(internal.careers.staleReads, { names: ["Acme", "Beta"], staleDays: 4 })).toEqual([]);
  vi.advanceTimersByTime(3 * 86_400_000);
  await t.mutation(internal.careers.markRead, { names: ["Beta"] });
  vi.advanceTimersByTime(2 * 86_400_000);
  // Acme: 5 days with no read. Beta: read 2 days ago.
  expect(await t.mutation(internal.careers.staleReads, { names: ["Acme", "Beta"], staleDays: 4 })).toEqual(["Acme"]);
  vi.useRealTimers();
});

test("the sweep list leaves LinkedIn and Google Jobs roles out", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("careerJobs", role("linkedin:1"));
    await ctx.db.insert("careerJobs", role("gjobs:1"));
    await ctx.db.insert("careerJobs", role("workday:x/y/z:/job/1", "Pfizer"));
  });
  const page = await t.query(internal.careers.boardRowsPage, { cursor: null });
  expect(page.rows).toEqual([{ externalId: "workday:x/y/z:/job/1", company: "Pfizer" }]);
});

test("found Workday boards aren't in the read list", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("discoveredBoards", { key: "pfizer", name: "Pfizer", ats: "workday", slug: "pfizer.wd1/pfizer/careers" });
    await ctx.db.insert("discoveredBoards", { key: "zylu", name: "Zylu", ats: "zoho", slug: "zylu.zohorecruit.in" });
  });
  const boards = await t.query(internal.careers.discovered, {});
  expect(boards.map((b) => b.name)).toEqual(["Zylu"]);
});
