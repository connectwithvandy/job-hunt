// Deletes saved jobs nobody touched that are closed or long posted (rule: lib/staleJobs.ts), with their details.
// Count first, nothing deleted:  npx convex run --prod jobCleanup:run '{"dryRun":true}'
// Delete:                        npx convex run --prod jobCleanup:run '{"dryRun":false}'
// Each run stops after ~8 minutes and says where it got to; run again with that cursor to carry on.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isStale } from "./lib/staleJobs";

const PAGE = 200;

export const page = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), dryRun: v.boolean(), now: v.number() },
  returns: v.object({ checked: v.number(), stale: v.number(), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, { cursor, dryRun, now }) => {
    const res = await ctx.db.query("jobs").paginate({ numItems: PAGE, cursor });
    // Jobs a chat was about, per person: chats have no job index, and each person has only a few.
    const chatJobs = new Map<Id<"users">, Set<string>>();
    let stale = 0;
    for (const j of res.page) {
      if (!isStale(j, now)) continue;
      if (await ctx.db.query("jobEmails").withIndex("by_jobId_and_at", (q) => q.eq("jobId", j._id)).first()) continue;
      if (await ctx.db.query("interviews").withIndex("by_jobId_and_start", (q) => q.eq("jobId", j._id)).first()) continue;
      if (!chatJobs.has(j.userId)) {
        const chats = await ctx.db.query("chats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", j.userId)).take(200);
        chatJobs.set(j.userId, new Set(chats.flatMap((c) => (c.jobId ? [c.jobId] : []))));
      }
      if (chatJobs.get(j.userId)!.has(j._id)) continue;
      stale++;
      if (dryRun) continue;
      const details = await ctx.db.query("jobDetails").withIndex("by_jobId", (q) => q.eq("jobId", j._id)).unique();
      if (details) await ctx.db.delete("jobDetails", details._id);
      await ctx.db.delete("jobs", j._id);
    }
    return { checked: res.page.length, stale, cursor: res.continueCursor, done: res.isDone };
  },
});

export const run = internalAction({
  args: { dryRun: v.boolean(), cursor: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, { dryRun, cursor }): Promise<string> => {
    const started = Date.now();
    let at: string | null = cursor ?? null;
    let checked = 0;
    let stale = 0;
    for (;;) {
      const r: { checked: number; stale: number; cursor: string; done: boolean } = await ctx.runMutation(internal.jobCleanup.page, { cursor: at, dryRun, now: started });
      checked += r.checked;
      stale += r.stale;
      at = r.cursor;
      if (r.done) return `${dryRun ? "Would delete" : "Deleted"} ${stale} of ${checked} jobs checked. Finished.`;
      if (Date.now() - started > 8 * 60_000) return `${dryRun ? "Would delete" : "Deleted"} ${stale} of ${checked} jobs checked so far. Carry on with: {"dryRun":${dryRun},"cursor":${JSON.stringify(at)}}`;
    }
  },
});
