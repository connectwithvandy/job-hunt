import { getAuthUserId, invalidateSessions, modifyAccountCredentials } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
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
    return { approved: await hasAccess(ctx, userId), onWaitlist: !!row, answered: !!row?.name, email: user?.email ?? "" };
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

/** A few words about you while you wait: name, LinkedIn and the role you're after. */
export const describe = mutation({
  args: { name: v.string(), linkedin: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    const name = args.name.trim().slice(0, 100);
    const linkedin = args.linkedin.trim().slice(0, 300);
    const role = args.role.trim().slice(0, 60);
    if (!name) throw new ConvexError("Add your name.");
    if (linkedin && !/^(https?:\/\/)?([a-z]+\.)?linkedin\.com\//i.test(linkedin)) throw new ConvexError("That doesn't look like a LinkedIn profile link.");
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (!row) throw new ConvexError("Join the waitlist first.");
    await ctx.db.patch("access", row._id, { name, linkedin: linkedin || undefined, role: role || undefined });
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
    const row = await ctx.db.get("access", accessId);
    if (!row) throw new ConvexError("That person isn't on the waitlist any more.");
    await ctx.db.patch("access", accessId, { approved, decidedAt: Date.now() });
    // Taken off the app: stop their morning searches too.
    if (!approved) {
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
      if (profile?.autopilot) await ctx.db.patch("profiles", profile._id, { autopilot: false });
    }
    return null;
  },
});

/** Let several people in at once. Owner only. */
export const approveMany = mutation({
  args: { accessIds: v.array(v.id("access")) },
  handler: async (ctx, { accessIds }) => {
    await requireOwner(ctx);
    const now = Date.now();
    const emails: string[] = [];
    for (const id of accessIds.slice(0, 100)) {
      const row = await ctx.db.get("access", id);
      if (!row || row.approved) continue;
      await ctx.db.patch("access", id, { approved: true, decidedAt: now });
      if (row.email) emails.push(row.email);
    }
    return emails;
  },
});

/** Who a password reset is for, checked as the owner. */
export const resetTarget = internalQuery({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }) => {
    await requireOwner(ctx);
    const row = await ctx.db.get("access", accessId);
    if (!row?.email) throw new ConvexError("That person isn't on the waitlist any more.");
    return { userId: row.userId, email: row.email };
  },
});

/**
 * A new temporary password for someone who forgot theirs, shown to the owner to pass on. Owner only.
 * JobPipe can't send email yet, so this stands in for a "forgot password" link. It also signs them out everywhere.
 */
export const resetPassword = action({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }): Promise<{ email: string; password: string }> => {
    const { userId, email } = await ctx.runQuery(internal.access.resetTarget, { accessId });
    // 12 letters and digits, without look-alikes (0/O, 1/l/I), so it's easy to read out or type.
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const password = Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => chars[n % chars.length]).join("");
    await modifyAccountCredentials(ctx, { provider: "password", account: { id: email, secret: password } });
    await invalidateSessions(ctx, { userId });
    return { email, password };
  },
});
