import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export async function requireUserId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Please sign in again.");
  return userId;
}
