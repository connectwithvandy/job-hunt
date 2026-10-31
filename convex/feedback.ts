import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isOwnerEmail, requireUserId } from "./lib/auth";

/** Send the owner a note from inside the app: a bug, an idea, anything. */
export const send = mutation({
  args: { text: v.string(), page: v.string() },
  handler: async (ctx, { text, page }) => {
    const userId = await requireUserId(ctx);
    const note = text.trim();
    if (!note) throw new ConvexError("Write something first.");
    if (note.length > 4000) throw new ConvexError("Keep it under 4,000 characters.");
    const user = await ctx.db.get("users", userId);
    await ctx.db.insert("feedback", { userId, email: user?.email ?? "", text: note, page: page.slice(0, 200) });
    return null;
  },
});

/** The latest notes from testers, newest first. Owner only. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get("users", userId) : null;
    if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can read feedback.");
    return await ctx.db.query("feedback").order("desc").take(100);
  },
});
