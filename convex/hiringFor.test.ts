/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { hiringFor } from "./lib/company";

const modules = import.meta.glob("./**/*.ts");

test("hiringFor names the company a recruiter posted for, and nothing when the text is about the poster", () => {
  expect(hiringFor("Buildesk is a fast-growing PropTech platform for builders.", "Cravingcode Technologie")).toBe("Buildesk");
  expect(hiringFor("Acme Labs is a leading SaaS firm.", "Acme")).toBeNull();
  expect(hiringFor("We are a SaaS company hiring AEs.", "Acme")).toBeNull();
  expect(hiringFor(undefined, "Acme")).toBeNull();
  // Real headings from the 28 Nov dry run.
  expect(hiringFor("About Us is a place where…", "Perk")).toBeNull();
  expect(hiringFor("About Us\n\nWe are building the future", "Wayground")).toBeNull();
  expect(hiringFor("Company Description\n\nWe are a team", "Infasta")).toBeNull();
  expect(hiringFor("The Role is a key part of", "PhonePe")).toBeNull();
  expect(hiringFor("Hevo\n\nHevo is a data platform", "Hevo Data")).toBeNull();
  expect(hiringFor("ABOUT MORPHO\n\nMorpho is a lab", "MorphoAI")).toBeNull();
  expect(hiringFor("Matter Intelligence is a seed-stage startup backed by Pear.", "Pear VC")).toBe("Matter Intelligence");
  expect(hiringFor("About Buildesk: a PropTech platform", "Cravingcode")).toBe("Buildesk");
});

test("a saved job keeps who it's really for, and the fill finds older ones", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "p@example.com" }));
  const base = { source: "pasted" as const, location: "Bengaluru", status: "new" as const, outreach: [], updatedAt: Date.now() };
  await t.mutation(internal.jobs.insertMany, {
    userId,
    jobs: [{ ...base, externalId: "a", url: "https://example.com/a", title: "Sales Manager", company: "Cravingcode", description: "Buildesk is a fast-growing PropTech platform." }],
  });
  const saved = await t.run(async (ctx) => (await ctx.db.query("jobs").collect())[0]);
  expect(saved.hiringFor).toBe("Buildesk");

  // An older job saved without the field.
  await t.run(async (ctx) => {
    const jobId = await ctx.db.insert("jobs", { userId, ...base, externalId: "b", url: "https://example.com/b", title: "AE", company: "Hirequest" });
    await ctx.db.insert("jobDetails", { jobId, userId, description: "Ledgerly is a B2B payments startup." });
  });
  const dry = await t.mutation(internal.jobs.fillHiringFor, { cursor: null, dryRun: true });
  expect(dry.matches).toEqual([{ company: "Hirequest", hiringFor: "Ledgerly", title: "AE" }]);
  expect(await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.externalId === "b")?.hiringFor ?? null)).toBeNull();
  await t.mutation(internal.jobs.fillHiringFor, { cursor: null, dryRun: false });
  expect(await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).find((j) => j.externalId === "b")?.hiringFor)).toBe("Ledgerly");
});
