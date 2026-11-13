import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { reviewValidator } from "./lib/cvReview";
import { rateLimiter } from "./limits";

/** Claim the one free review for this email, within today's cap for everyone. Throws a friendly reason when there isn't one. */
export const reserve = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (!isOwnerEmail(email)) {
      const used = await ctx.db.query("cvReviews").withIndex("by_email", (q) => q.eq("email", email)).first();
      if (used) {
        throw new ConvexError(
          "You've had your free review. Sign up on JobPipe, free, for re-checks after every change and a CV tailored to each job.",
        );
      }
    }
    const { ok } = await rateLimiter.limit(ctx, "freeReview", { key: "everyone" });
    if (!ok) throw new ConvexError("Today's free reviews are all used. Come back tomorrow.");
    return null;
  },
});

export const save = internalMutation({
  args: { email: v.string(), role: v.string(), review: reviewValidator },
  handler: async (ctx, { email, role, review }) => {
    await ctx.db.insert("cvReviews", { email, role, score: review.score, review });
    return null;
  },
});

/** Who used the free review, newest first: leads for the owner. Owner only. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get("users", userId) : null;
    if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can see this.");
    const rows = await ctx.db.query("cvReviews").order("desc").take(100);
    return rows.map((r) => ({ _id: r._id, _creationTime: r._creationTime, email: r.email, role: r.role, score: r.score }));
  },
});

const DAY = 86_400_000;

/**
 * Free reviews from 2 to 30 days ago whose person hasn't joined and hasn't had the follow-up: one row per email.
 * The table is small (one review per email), so it's read whole.
 */
export const followUpsDue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("cvReviews").order("desc").take(500);
    const members = new Set((await ctx.db.query("access").take(5000)).map((a) => a.email.trim().toLowerCase()));
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        const email = r.email.trim().toLowerCase();
        const fresh = now - r._creationTime >= 2 * DAY && now - r._creationTime <= 30 * DAY;
        if (!fresh || r.followedUpAt || members.has(email) || seen.has(email) || isOwnerEmail(email)) return false;
        seen.add(email);
        return true;
      })
      .map((r) => ({ id: r._id, email: r.email, role: r.role, score: r.score }));
  },
});

export const markFollowedUp = internalMutation({
  args: { id: v.id("cvReviews") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch("cvReviews", id, { followedUpAt: Date.now() });
    return null;
  },
});
