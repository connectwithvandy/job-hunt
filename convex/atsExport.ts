// Read-only: each member's latest tailored CV, to check that hiring software reads it in the right order.
// npx convex run --prod atsExport:run '{}' > cvs.json
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

const STATUSES = ["applying", "applied", "screening", "interview", "offer", "rejected"] as const;

/** The newest tailored CV on a job the member moved past "new" (small lists, read by status). */
export const latestCv = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    let best: { at: number; company: string; resume: unknown } | null = null;
    for (const status of STATUSES) {
      const jobs = await ctx.db.query("jobs").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status)).order("desc").take(40);
      for (const j of jobs) if (j.pack?.resume && (!best || j._creationTime > best.at)) best = { at: j._creationTime, company: j.company, resume: j.pack.resume };
    }
    return best;
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
