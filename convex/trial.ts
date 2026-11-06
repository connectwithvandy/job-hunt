// A personal check-in from the founder two days before someone's free week ends: what JobPipe did for them, and how to keep going.
// On day 7, anyone set up who hasn't paid gets 3 extra days and a note saying so.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { emailOn, sendEmail, trialEmail, trialExtendedEmail } from "./lib/email";
import { isOwnerEmail } from "./lib/auth";
import { priceOf } from "./lib/plans";
import { checkInDue, extensionDue, trialEnd } from "./lib/trial";
import { foundingFor } from "./payments";

const statsV = v.object({ found: v.number(), strong: v.number(), cvs: v.number(), applied: v.number(), interviews: v.number() });

/** Everyone due a check-in today, with what JobPipe did for them during the week. */
export const due = internalQuery({
  args: { now: v.number() },
  returns: v.array(
    v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()), endsAt: v.number(), month: v.number(), pass: v.number(), stats: statsV }),
  ),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      const end = trialEnd(row);
      if (!end || row.trialNoteAt || !row.email || isOwnerEmail(row.email)) continue;
      if ((row.paidUntil ?? 0) > now || !checkInDue(end, now)) continue;
      const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", row.userId)).take(3000);
      const best = (j: (typeof jobs)[number]) => Math.max(0, ...(j.scores ?? []).map((s) => s.score));
      const stats = {
        found: jobs.length,
        strong: jobs.filter((j) => best(j) >= 75).length,
        cvs: jobs.filter((j) => j.hasPack || j.pack).length,
        applied: jobs.filter((j) => ["applied", "screening", "interview", "offer", "rejected"].includes(j.status)).length,
        interviews: jobs.filter((j) => j.status === "interview" || j.status === "offer").length,
      };
      const founding = await foundingFor(ctx, row.userId);
      out.push({ accessId: row._id, email: row.email, name: row.name, endsAt: end, month: priceOf("month", founding).rupees, pass: priceOf("pass", founding).rupees, stats });
    }
    return out;
  },
});

export const markSent = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.null(),
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { trialNoteAt: Date.now() });
    return null;
  },
});

/** People set up whose first week just ended, who haven't paid and haven't had the extra days. */
export const extensionsDue = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()), month: v.number(), pass: v.number() })),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      const end = trialEnd(row);
      if (!end || row.trialExtendedAt || !row.email || isOwnerEmail(row.email)) continue;
      if ((row.paidUntil ?? 0) > now || !extensionDue(end, now)) continue;
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
      if (!profile?.onboarded) continue;
      const founding = await foundingFor(ctx, row.userId);
      out.push({ accessId: row._id, email: row.email, name: row.name, month: priceOf("month", founding).rupees, pass: priceOf("pass", founding).rupees });
    }
    return out;
  },
});

export const markExtended = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.null(),
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { trialExtendedAt: Date.now() });
    return null;
  },
});

export const sendCheckIns = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!emailOn()) return null;
    const people = await ctx.runQuery(internal.trial.due, { now: Date.now() });
    for (const p of people) {
      try {
        await sendEmail({ to: p.email, ...trialEmail(p) });
        await ctx.runMutation(internal.trial.markSent, { accessId: p.accessId });
      } catch (err) {
        // One bad address doesn't stop the rest; it is tried again tomorrow.
        console.warn("Trial check-in failed for", p.email, String(err));
      }
    }
    const extended = await ctx.runQuery(internal.trial.extensionsDue, { now: Date.now() });
    for (const p of extended) {
      try {
        await sendEmail({ to: p.email, ...trialExtendedEmail(p) });
        await ctx.runMutation(internal.trial.markExtended, { accessId: p.accessId });
      } catch (err) {
        console.warn("Extra days email failed for", p.email, String(err));
      }
    }
    return null;
  },
});
