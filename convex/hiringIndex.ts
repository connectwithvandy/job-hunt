// The India Sales Hiring Index: a public weekly page built from the roles JobPipe reads on company careers pages.
// hiringIndexBuild.ts makes the snapshot on Mondays; the page reads the newest one and the one before, for changes.

import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const save = internalMutation({
  args: { week: v.string(), data: v.string() },
  returns: v.null(),
  handler: async (ctx, { week, data }) => {
    const have = await ctx.db.query("hiringIndex").withIndex("by_week", (q) => q.eq("week", week)).unique();
    if (have) await ctx.db.patch("hiringIndex", have._id, { data, builtAt: Date.now() });
    else await ctx.db.insert("hiringIndex", { week, data, builtAt: Date.now() });
    return null;
  },
});

/** The newest snapshot and the one before it, as JSON text. Null before the first build. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    const [now, before] = await ctx.db.query("hiringIndex").withIndex("by_week").order("desc").take(2);
    return now ? { week: now.week, builtAt: now.builtAt, data: now.data, previous: before?.data ?? null } : null;
  },
});
