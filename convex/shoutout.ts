// After someone's first interview or offer, a note from the founder: congrats, and would they give JobPipe a LinkedIn shoutout. Once per person.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { emailOn, sendEmail, shoutoutEmail } from "./lib/email";

/** Everyone let in 14+ days ago who has reached an interview or offer and hasn't been asked yet. An offer wins over an interview. */
export const due = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()), title: v.string(), offer: v.boolean() })),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      if (row.shoutoutAskedAt || !row.email || isOwnerEmail(row.email)) continue;
      // Not in their first two weeks: those already carry the welcome, check-in and pop-ups.
      if (!row.decidedAt || now - row.decidedAt < 14 * 86_400_000) continue;
      // Only their offers and interviews are read, not every job.
      const offer = await ctx.db.query("jobs").withIndex("by_userId_and_status", (q) => q.eq("userId", row.userId).eq("status", "offer")).order("desc").take(10);
      const interview = offer.length ? [] : await ctx.db.query("jobs").withIndex("by_userId_and_status", (q) => q.eq("userId", row.userId).eq("status", "interview")).order("desc").take(10);
      const wins = offer.length ? offer : interview;
      if (!wins.length) continue;
      // A job made from an email may have no role yet ("Role not named yet"): never put that in a post.
      const named = wins.find((j) => j.title && !/not named/i.test(j.title));
      out.push({ accessId: row._id, email: row.email, name: row.name, title: named?.title ?? "", offer: offer.length > 0 });
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
    const people = await ctx.runQuery(internal.shoutout.due, { now: Date.now() });
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
