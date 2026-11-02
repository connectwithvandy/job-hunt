import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { appUrl, emailOn, sendEmail } from "./lib/email";
import { rateLimiter } from "./limits";

/** A browser saw a crash or an unexpected error. Kept short, capped per person a day, and emailed to the owner hourly. */
export const report = mutation({
  args: { message: v.string(), page: v.string() },
  handler: async (ctx, { message, page }) => {
    const userId = (await getAuthUserId(ctx)) ?? undefined;
    const { ok } = await rateLimiter.limit(ctx, "appError", { key: userId ?? "signed-out" });
    if (!ok) return null;
    const user = userId ? await ctx.db.get("users", userId) : null;
    await ctx.db.insert("appErrors", { userId, email: user?.email ?? "", message: message.slice(0, 1000), page: page.slice(0, 200), emailed: false });
    return null;
  },
});

/** The latest errors, newest first. Owner only. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get("users", userId) : null;
    if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can read errors.");
    return await ctx.db.query("appErrors").order("desc").take(30);
  },
});

export const unsent = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("appErrors").withIndex("by_emailed", (q) => q.eq("emailed", false)).take(50),
});

export const markSent = internalMutation({
  args: { ids: v.array(v.id("appErrors")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.patch("appErrors", id, { emailed: true });
    return null;
  },
});

/** One email to the owner listing new errors, at most once an hour. Nothing new, no email. */
export const mailOwner = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.runQuery(internal.errors.unsent, {});
    const owners = (env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!rows.length || !owners.length || !emailOn()) return null;
    const lines = rows.map((r) => `- ${new Date(r._creationTime).toISOString().slice(0, 16).replace("T", " ")} UTC · ${r.email || "signed out"} · ${r.page}\n  ${r.message}`);
    await sendEmail({
      to: owners[0],
      subject: `JobPipe: ${rows.length} new error${rows.length === 1 ? "" : "s"}`,
      text: `People hit these in the last hour:\n\n${lines.join("\n\n")}\n\nAll recent errors: ${appUrl()}/admin`,
    });
    await ctx.runMutation(internal.errors.markSent, { ids: rows.map((r) => r._id) });
    return null;
  },
});

/** Remove the errors the owner has looked at: only the ids on their screen, so one that just arrived stays. Owner only. */
export const clear = mutation({
  args: { ids: v.array(v.id("appErrors")) },
  handler: async (ctx, { ids }) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get("users", userId) : null;
    if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can clear errors.");
    // A double click finds it already gone: nothing to do.
    for (const id of ids.slice(0, 50)) if (await ctx.db.get("appErrors", id)) await ctx.db.delete("appErrors", id);
    return null;
  },
});
