import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { env, type ActionCtx, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** The app's owner, from OWNER_EMAILS. Always let in, and the only one who can approve the waitlist. */
export function isOwnerEmail(email: string | undefined) {
  const owners = (env.OWNER_EMAILS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!email && owners.includes(email.toLowerCase());
}

/** The owner, or someone the owner let in from the waitlist. */
export async function hasAccess(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (isOwnerEmail(user?.email)) return true;
  const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  return row?.approved ?? false;
}

export async function requireUserId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Please sign in again.");
  const allowed: boolean = "db" in ctx ? await hasAccess(ctx, userId) : await ctx.runQuery(internal.access.allowed, { userId });
  if (!allowed) throw new ConvexError("You're on the waitlist. You'll get in once you're approved.");
  return userId;
}
