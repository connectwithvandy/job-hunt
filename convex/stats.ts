import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import type { HealthFacts } from "./lib/health";
import { lockAt, trialOver } from "./lib/trial";
import { aiLimit, FRESH_ALERTS_A_DAY, rateLimiter } from "./limits";
import { internalMutation, jobCounts } from "./lib/functions";

/** What one person let in has done, for the owner's admin page. */
type Usage = { accessId: Id<"access">; lastSeenAt?: number; setUp: boolean; jobs: number; scored: number; tailored: number; applied: number };

const STEPS = ["Let in", "Set up", "Searched", "Scored a job", "Tailored a CV", "Applied", "Paid"] as const;

/** The numbers for the health block in the owner's morning email. */
export const healthFacts = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<HealthFacts> => {
    const profiles = await ctx.db.query("profiles").withIndex("by_autopilot", (q) => q.eq("autopilot", true)).take(300);
    const rows = (await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000)).filter((r) => !isOwnerEmail(r.email));
    const config = aiLimit();
    const { value } = await rateLimiter.getValue(ctx, "appAi", { config });
    const fresh = await rateLimiter.getValue(ctx, "freshAlert");
    const unpaid = rows.filter((r) => (r.paidUntil ?? 0) <= now);
    return {
      people: profiles.length,
      runs: profiles.flatMap((p) => (p.lastAutopilot ? [p.lastAutopilot] : [])),
      letIn: rows.length,
      paying: rows.length - unpaid.length,
      trialOver: rows.filter((r) => trialOver(r, now)).length,
      lockingSoon: unpaid.filter((r) => {
        const at = lockAt(r);
        return !!at && at > now && at <= now + 3 * 86_400_000;
      }).length,
      aiUsed: Math.max(0, Math.round(config.rate - value)),
      aiLimit: config.rate,
      freshSent: Math.max(0, Math.round(FRESH_ALERTS_A_DAY - fresh.value)),
    };
  },
});

/** How far each person let in has got, step by step, and what each one has done. Reads one small totals row per person. */
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
      const t = await ctx.db.query("usageTotals").withIndex("by_userId", (q) => q.eq("userId", p.userId)).unique();
      const jobs = t?.jobs ?? 0;
      const scored = t?.scored ?? 0;
      const tailored = t?.tailored ?? 0;
      const applied = t?.applied ?? 0;
      if (jobs) counts["Searched"]++;
      if (scored) counts["Scored a job"]++;
      if (tailored) counts["Tailored a CV"]++;
      if (applied) counts["Applied"]++;
      if ((p.paidUntil ?? 0) > now) counts["Paid"]++;
      usage.push({ accessId: p._id, lastSeenAt: profile?.lastSeenAt, setUp: !!profile?.onboarded, jobs, scored, tailored, applied });
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

// ---------- Nightly recount ----------
// The totals are kept up to date as jobs change; this recounts from scratch each night so any slip is gone by morning.

const PAGE = 200;

/** Counts one page of a person's jobs and carries the running sum on; the last page saves the totals. */
export const recountPerson = internalMutation({
  args: {
    userId: v.id("users"),
    cursor: v.union(v.string(), v.null()),
    sum: v.object({ jobs: v.number(), scored: v.number(), tailored: v.number(), applied: v.number() }),
  },
  returns: v.null(),
  handler: async (ctx, { userId, cursor, sum }) => {
    const page = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).paginate({ cursor, numItems: PAGE });
    const next = { ...sum };
    for (const j of page.page) {
      const c = jobCounts(j);
      next.jobs += c.jobs;
      next.scored += c.scored;
      next.tailored += c.tailored;
      next.applied += c.applied;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.stats.recountPerson, { userId, cursor: page.continueCursor, sum: next });
      return null;
    }
    const row = await ctx.db.query("usageTotals").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (row) await ctx.db.patch("usageTotals", row._id, { ...next, countedAt: Date.now() });
    else await ctx.db.insert("usageTotals", { userId, ...next, countedAt: Date.now() });
    return null;
  },
});

export const peopleToCount = internalQuery({
  args: {},
  returns: v.array(v.id("users")),
  handler: async (ctx) => (await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(2000)).map((a) => a.userId),
});

/** Starts a recount for everyone let in. Each person's count runs on its own, so no single step reads too much. */
export const recountAll = internalAction({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const people: Id<"users">[] = await ctx.runQuery(internal.stats.peopleToCount, {});
    // Spread out a little so a big night doesn't all land at once.
    for (const [i, userId] of people.entries()) {
      await ctx.scheduler.runAfter(i * 200, internal.stats.recountPerson, { userId, cursor: null, sum: { jobs: 0, scored: 0, tailored: 0, applied: 0 } });
    }
    return `Recounting ${people.length} people.`;
  },
});
