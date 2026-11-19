import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, mutation, query } from "./_generated/server";
import { emailOn, REPLY_TO, sendEmail } from "./lib/email";
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
    const email = user?.email ?? "";
    await ctx.db.insert("feedback", { userId, email, text: note, page: page.slice(0, 200) });
    // The owner hears about it straight away; pressing Reply in the mail answers the member directly.
    if (!isOwnerEmail(email)) await ctx.scheduler.runAfter(0, internal.feedback.notifyOwner, { email, text: note, page: page.slice(0, 200) });
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

/** Emails the owner one help message, with the member as the reply address. Skipped quietly when email is off. */
export const notifyOwner = internalAction({
  args: { email: v.string(), text: v.string(), page: v.string() },
  handler: async (_ctx, { email, text, page }) => {
    if (!emailOn()) return null;
    await sendEmail({
      to: REPLY_TO,
      replyTo: email || undefined,
      subject: `JobPipe help: ${text.split("\n")[0].slice(0, 60)}`,
      text: `${email || "A member"} wrote from ${page}:\n\n${text}\n\nPress Reply to answer them. Mark it solved in Admin → Feedback.`,
    });
    return null;
  },
});

/** Marks a help message solved, or opens it again. Owner only. */
export const setSolved = mutation({
  args: { id: v.id("feedback"), solved: v.boolean() },
  handler: async (ctx, { id, solved }) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can do that.");
    await ctx.db.patch("feedback", id, { solvedAt: solved ? Date.now() : undefined });
    return null;
  },
});
