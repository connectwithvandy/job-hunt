// The founding-offer email's data: who gets it, their numbers, and their one-click answers (offer.ts sends it).

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { OFFER_ANSWERS } from "./lib/email";

/** Everyone let in who isn't paying or on a partner deal, hasn't said stop, and hasn't had the offer. `to` narrows it to one person (a test). */
export const recipients = internalQuery({
  args: { to: v.optional(v.string()) },
  returns: v.array(v.object({ userId: v.id("users"), email: v.string(), name: v.optional(v.string()) })),
  handler: async (ctx, { to }) => {
    const now = Date.now();
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const r of rows) {
      if (!r.email) continue;
      if (to) {
        if (r.email.toLowerCase() !== to.toLowerCase()) continue;
      } else if (isOwnerEmail(r.email) || r.alertsOff || r.rejected) continue;
      if ((r.paidUntil ?? 0) > now || (r.partner?.until ?? 0) > now) continue;
      const had = await ctx.db.query("offerSends").withIndex("by_userId", (q) => q.eq("userId", r.userId)).first();
      if (had && !to) continue;
      out.push({ userId: r.userId, email: r.email, name: r.name });
    }
    return out;
  },
});

/** Their own numbers for the email: jobs found, jobs scored, and how many scored 70+. */
export const factsFor = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({ jobs: v.number(), scored: v.number(), strong: v.number() }),
  handler: async (ctx, { userId }) => {
    const totals = await ctx.db.query("usageTotals").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    let strong = 0;
    for await (const j of ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId))) {
      if ((j.scores ?? []).some((s) => s.score >= 70)) strong++;
    }
    return { jobs: totals?.jobs ?? 0, scored: totals?.scored ?? 0, strong };
  },
});

export const record = internalMutation({
  args: { userId: v.id("users"), email: v.string(), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("offerSends", { ...args, sentAt: Date.now() });
    return null;
  },
});

/** A one-click answer (and an optional note) from the email's links. False when the link isn't recognised. */
export const answer = internalMutation({
  args: { token: v.string(), answer: v.string(), note: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { token, answer, note }) => {
    if (!OFFER_ANSWERS.some((a) => a.key === answer)) return false;
    const row = await ctx.db.query("offerSends").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (!row) return false;
    await ctx.db.patch("offerSends", row._id, { answer, answeredAt: Date.now(), ...(note?.trim() ? { note: note.trim().slice(0, 1000) } : {}) });
    return true;
  },
});

/** For the owner: how many got it, how many paid since, and what the rest said. */
export const results = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const rows = await ctx.db.query("offerSends").take(2000);
    const counts: Record<string, number> = {};
    for (const r of rows) if (r.answer) counts[r.answer] = (counts[r.answer] ?? 0) + 1;
    let paid = 0;
    for (const r of rows) {
      const access = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", r.userId)).first();
      if ((access?.paidUntil ?? 0) > r.sentAt) paid++;
    }
    return {
      sent: rows.length,
      paidSince: paid,
      answered: rows.filter((r) => r.answer).length,
      answers: OFFER_ANSWERS.map((a) => `${a.label}: ${counts[a.key] ?? 0}`),
      notes: rows.filter((r) => r.note).map((r) => `${r.email} (${r.answer}): ${r.note}`),
    };
  },
});
