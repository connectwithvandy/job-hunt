import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";

const STEPS = ["Let in", "Set up", "Searched", "Scored a job", "Tailored a CV", "Applied", "Paid"] as const;

/** How far each person let in has got, step by step. Reads a lot, so it runs only when the owner asks. */
export const funnelData = internalQuery({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, { userId, now }) => {
    const me = await ctx.db.get("users", userId);
    if (!isOwnerEmail(me?.email)) throw new ConvexError("Only the owner can see this.");
    const people = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(200);
    const counts = Object.fromEntries(STEPS.map((s) => [s, 0])) as Record<(typeof STEPS)[number], number>;
    for (const p of people) {
      counts["Let in"]++;
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", p.userId)).unique();
      if (profile?.onboarded) counts["Set up"]++;
      // The newest 300 jobs show whether they've used each part; nobody reaches a step without recent jobs.
      const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", p.userId)).order("desc").take(300);
      if (jobs.length) counts["Searched"]++;
      if (jobs.some((j) => j.scores?.length)) counts["Scored a job"]++;
      if (jobs.some((j) => j.hasPack)) counts["Tailored a CV"]++;
      if (jobs.some((j) => j.appliedAt)) counts["Applied"]++;
      if ((p.paidUntil ?? 0) > now) counts["Paid"]++;
    }
    return STEPS.map((step) => ({ step, people: counts[step] }));
  },
});

export const funnel = action({
  args: {},
  handler: async (ctx): Promise<{ step: string; people: number }[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    return await ctx.runQuery(internal.stats.funnelData, { userId, now: Date.now() });
  },
});
