import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { hasAccess, isOwnerEmail } from "./lib/auth";

async function requireOwner(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get("users", userId) : null;
  if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can manage the waitlist.");
}

export const allowed = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await hasAccess(ctx, userId),
});

/** Whether you're let in yet, and whether you've joined the waitlist. Null when signed out. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const user = await ctx.db.get("users", userId);
    return { approved: await hasAccess(ctx, userId), onWaitlist: !!row, email: user?.email ?? "" };
  },
});

/** Put yourself on the waitlist. Safe to call more than once. */
export const join = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    const existing = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (existing) return null;
    const user = await ctx.db.get("users", userId);
    await ctx.db.insert("access", { userId, email: user?.email ?? "", approved: false });
    return null;
  },
});

/** Everyone who signed up, waiting first. Owner only. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const waiting = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", false)).order("desc").take(200);
    const approved = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).order("desc").take(200);
    return { waiting, approved };
  },
});

export const setApproved = mutation({
  args: { accessId: v.id("access"), approved: v.boolean() },
  handler: async (ctx, { accessId, approved }) => {
    await requireOwner(ctx);
    await ctx.db.patch("access", accessId, { approved, decidedAt: Date.now() });
    return null;
  },
});
