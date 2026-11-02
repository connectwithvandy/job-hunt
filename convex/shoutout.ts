// After someone's first interview or offer, a note from the founder: congrats, and would they give JobPipe a LinkedIn shoutout. Once per person.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { emailOn, sendEmail, shoutoutEmail } from "./lib/email";

/** Everyone let in who has reached an interview or offer and hasn't been asked yet. An offer wins over an interview. */
export const due = internalQuery({
  args: {},
  returns: v.array(v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()), title: v.string(), offer: v.boolean() })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      if (row.shoutoutAskedAt || !row.email || isOwnerEmail(row.email)) continue;
      const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", row.userId)).order("desc").take(3000);
      const win = jobs.find((j) => j.status === "offer") ?? jobs.find((j) => j.status === "interview");
      if (!win) continue;
      out.push({ accessId: row._id, email: row.email, name: row.name, title: win.title, offer: win.status === "offer" });
    }
    return out;
  },
});

export const markAsked = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.null(),
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { shoutoutAskedAt: Date.now() });
    return null;
  },
});

export const sendAsks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!emailOn()) return null;
    const people = await ctx.runQuery(internal.shoutout.due, {});
    for (const p of people) {
      try {
        await sendEmail({ to: p.email, ...shoutoutEmail(p) });
        await ctx.runMutation(internal.shoutout.markAsked, { accessId: p.accessId });
      } catch (err) {
        // One bad address doesn't stop the rest; it is tried again tomorrow.
        console.warn("Shoutout ask failed for", p.email, String(err));
      }
    }
    return null;
  },
});
