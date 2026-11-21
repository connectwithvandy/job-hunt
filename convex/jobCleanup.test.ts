/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

test("deletes only untouched jobs found 30+ days ago that are closed or posted 90+ days ago", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "c@example.com" });
    const base = { userId, externalId: "x", source: "adzuna", url: "https://a.b", title: "SDR", company: "Acme", location: "Bengaluru", status: "new" as const, outreach: [], updatedAt: now };
    const closed = { at: now, state: "closed" as const, note: "" };
    const mk = (extra: Record<string, unknown>) => ctx.db.insert("jobs", { ...base, ...extra } as never);
    return {
      closed: await mk({ liveCheck: closed }),
      old: await mk({ postedAt: new Date(now - 100 * DAY).toISOString() }),
      fresh: await mk({ postedAt: new Date(now - 10 * DAY).toISOString() }),
      starred: await mk({ liveCheck: closed, favorite: true }),
      applied: await mk({ liveCheck: closed, status: "applied" }),
      dismissed: await mk({ liveCheck: closed, status: "dismissed" }),
      tailored: await mk({ liveCheck: closed, hasPack: true }),
    };
  });
  // Found just now: nothing goes, closed or not.
  expect((await t.mutation(internal.jobCleanup.page, { cursor: null, dryRun: true, now })).stale).toBe(0);
  // A month and a bit later, all were found 30+ days ago.
  const later = now + 31 * DAY;
  const dry = await t.mutation(internal.jobCleanup.page, { cursor: null, dryRun: true, now: later });
  // closed, old (130 days posted by then) and fresh (40 days posted, not 90) -> closed + old only.
  expect(dry.stale).toBe(2);
  expect(await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).length)).toBe(7);
  await t.mutation(internal.jobCleanup.page, { cursor: null, dryRun: false, now: later });
  const left = await t.run(async (ctx) => (await ctx.db.query("jobs").collect()).map((j) => j._id));
  expect(left).not.toContain(ids.closed);
  expect(left).not.toContain(ids.old);
  for (const keep of [ids.fresh, ids.starred, ids.applied, ids.dismissed, ids.tailored]) expect(left).toContain(keep);
});
