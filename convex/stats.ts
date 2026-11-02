import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";

/** What one person let in has done, for the owner's waitlist page. Job counts stop at 300. */
type Usage = { accessId: Id<"access">; lastSeenAt?: number; setUp: boolean; jobs: number; scored: number; tailored: number; applied: number };

const STEPS = ["Let in", "Set up", "Searched", "Scored a job", "Tailored a CV", "Applied", "Paid"] as const;

/** How far each person let in has got, step by step, and what each one has done. Reads a lot, so it runs only when the owner asks. */
export const funnelData = internalQuery({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, { userId, now }) => {
    const me = await ctx.db.get("users", userId);
    if (!isOwnerEmail(me?.email)) throw new ConvexError("Only the owner can see this.");
    const people = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(200);
    const counts = Object.fromEntries(STEPS.map((s) => [s, 0])) as Record<(typeof STEPS)[number], number>;
    const usage: Usage[] = [];
    for (const p of people) {
      counts["Let in"]++;
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", p.userId)).unique();
      if (profile?.onboarded) counts["Set up"]++;
      // The newest 300 jobs show whether they've used each part; nobody reaches a step without recent jobs.
      const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", p.userId)).order("desc").take(300);
      const scored = jobs.filter((j) => j.scores?.length).length;
      const tailored = jobs.filter((j) => j.hasPack).length;
      const applied = jobs.filter((j) => j.appliedAt).length;
      if (jobs.length) counts["Searched"]++;
      if (scored) counts["Scored a job"]++;
      if (tailored) counts["Tailored a CV"]++;
      if (applied) counts["Applied"]++;
      if ((p.paidUntil ?? 0) > now) counts["Paid"]++;
      usage.push({ accessId: p._id, lastSeenAt: profile?.lastSeenAt, setUp: !!profile?.onboarded, jobs: jobs.length, scored, tailored, applied });
    }
    return { steps: STEPS.map((step) => ({ step, people: counts[step] })), usage, now };
  },
});

export const funnel = action({
  args: {},
  handler: async (ctx): Promise<{ steps: { step: string; people: number }[]; usage: Usage[]; now: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    return await ctx.runQuery(internal.stats.funnelData, { userId, now: Date.now() });
  },
});
