// Read-only: each member's latest tailored CV, to check that hiring software reads it in the right order.
// npx convex run --prod atsExport:run '{}' > cvs.json
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";

const STATUSES = ["applying", "applied", "screening", "interview", "offer", "rejected", "new"] as const;

/** The newest tailored CV (kept in jobDetails, flagged by hasPack on the job). */
export const latestCv = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    let best: { at: number; jobId: Id<"jobs">; company: string } | null = null;
    for (const status of STATUSES) {
      const jobs = await ctx.db.query("jobs").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status)).order("desc").take(status === "new" ? 1500 : 200);
      for (const j of jobs) if (j.hasPack && (!best || j._creationTime > best.at)) best = { at: j._creationTime, jobId: j._id, company: j.company };
    }
    if (!best) return null;
    const d = await ctx.db.query("jobDetails").withIndex("by_jobId", (q) => q.eq("jobId", best.jobId)).unique();
    return d?.pack?.resume ? { company: best.company, resume: d.pack.resume } : null;
  },
});

export const run = internalAction({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<unknown[]> => {
    const people: { userId: string; email: string; tailored: number }[] = await ctx.runQuery(internal.postStats.reviewPeople, {});
    const out = [];
    for (const p of people.filter((x) => x.tailored > 0)) {
      const cv: { company: string; resume: unknown } | null = await ctx.runQuery(internal.atsExport.latestCv, { userId: p.userId as never });
      out.push({ email: p.email, company: cv?.company ?? null, resume: cv?.resume ?? null });
    }
    return out;
  },
});
