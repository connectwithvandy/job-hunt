// One morning's results from a quota-limited job board, shared by everyone searching the same title in the same
// place (see schema: sourceCache). Members' morning searches run 45 seconds apart, so the first one fetches and
// the rest read the saved copy.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Saved results this fresh are reused. Mornings are a day apart, so a day-old copy is fetched again. */
export const FRESH_MS = 20 * 3_600_000;
/** After a board says it's out of searches, leave it alone this long. */
export const BLOCK_MS = 6 * 3_600_000;

export const get = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.null(), v.object({ jobs: v.string(), fetchedAt: v.number(), blocked: v.boolean() })),
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("sourceCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return row ? { jobs: row.jobs, fetchedAt: row.fetchedAt, blocked: !!row.blocked } : null;
  },
});

export const put = internalMutation({
  args: { key: v.string(), jobs: v.string(), blocked: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { key, jobs, blocked }) => {
    const row = await ctx.db.query("sourceCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const fields = { key, jobs, fetchedAt: Date.now(), blocked };
    if (row) await ctx.db.replace("sourceCache", row._id, fields);
    else await ctx.db.insert("sourceCache", fields);
    return null;
  },
});
