/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { quotaTitles, searchOtherSources, type CachedSearch } from "./lib/sources";

const modules = import.meta.glob("./**/*.ts");

test("quota boards skip short forms like SDR and BDR, keeping the full names", () => {
  expect(quotaTitles(["Sales Development Representative", "SDR", "Business Development Representative", "BDR", "Inside Sales Executive"])).toEqual([
    "Sales Development Representative",
    "Business Development Representative",
    "Inside Sales Executive",
  ]);
  // Only short forms: keep them rather than search nothing.
  expect(quotaTitles(["SDR"])).toEqual(["SDR"]);
});

test("saved results: one row per key, replaced on each save", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(internal.sourceCache.get, { key: "adzuna|sdr|in:bengaluru" })).toBeNull();
  await t.mutation(internal.sourceCache.put, { key: "adzuna|sdr|in:bengaluru", jobs: "[1]" });
  await t.mutation(internal.sourceCache.put, { key: "adzuna|sdr|in:bengaluru", jobs: "[2]" });
  const row = await t.query(internal.sourceCache.get, { key: "adzuna|sdr|in:bengaluru" });
  expect(row).toMatchObject({ jobs: "[2]", blocked: false });
  expect(await t.run(async (ctx) => (await ctx.db.query("sourceCache").collect()).length)).toBe(1);
});

test("Adzuna goes through the shared search, with a key for the title and place, and never for SDR", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  const seen: string[] = [];
  const cached: CachedSearch = async (source, title, placeKey) => {
    seen.push(`${source}|${title}|${placeKey}`);
    return [];
  };
  await searchOtherSources(["SDR", "Sales Development Representative"], "Bengaluru", 0, 4, cached);
  vi.unstubAllGlobals();
  expect(seen).toEqual(["adzuna|Sales Development Representative|in:bengaluru"]);
});
