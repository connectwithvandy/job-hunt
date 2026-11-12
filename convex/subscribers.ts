// The daily sales jobs email for people without an account: up to 3 titles, one place, an email.
// Signing up sends the first email straight away; after that one goes each morning with roles found since
// (subscriberSend.ts). Every email has a one-click unsubscribe link (http.ts /unsubscribe).

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { rateLimiter } from "./limits";

const DAY = 86_400_000;
export const MAX_TITLES = 3;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const newKey = () => crypto.randomUUID().replace(/-/g, "");

/** Cleans what a stranger typed: up to 3 distinct titles of sensible length, and a place. Throws a plain message if unusable. */
export function readSignup(raw: { email: string; titles: string[]; location: string }) {
  const email = raw.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) throw new ConvexError("That email doesn't look right.");
  const titles: string[] = [];
  for (const t of raw.titles.map((x) => x.trim().replace(/\s+/g, " ").slice(0, 60))) {
    if (t && !titles.some((x) => x.toLowerCase() === t.toLowerCase())) titles.push(t);
  }
  titles.splice(MAX_TITLES);
  if (!titles.length) throw new ConvexError("Pick at least one job title.");
  const location = raw.location.trim().slice(0, 60) || "India";
  return { email, titles, location };
}

/** Sign up, or change titles and place for an email already signed up (which also turns it back on). */
export const subscribe = mutation({
  args: { email: v.string(), titles: v.array(v.string()), location: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { email, titles, location } = readSignup({ ...args, titles: args.titles.slice(0, 10) });
    const { ok } = await rateLimiter.limit(ctx, "subscribe");
    if (!ok) throw new ConvexError("Too many sign-ups today. Please try again tomorrow.");
    const have = await ctx.db.query("subscribers").withIndex("by_email", (q) => q.eq("email", email)).unique();
    let id: Id<"subscribers">;
    if (have) {
      await ctx.db.patch("subscribers", have._id, { titles, location, off: undefined });
      id = have._id;
    } else {
      id = await ctx.db.insert("subscribers", { email, titles, location, key: newKey() });
    }
    // The first email goes now, with roles open today, so signing up shows what it's worth at once.
    await ctx.scheduler.runAfter(0, internal.subscriberSend.sendFirst, { id });
    return null;
  },
});

export const get = internalQuery({
  args: { id: v.id("subscribers") },
  handler: async (ctx, { id }) => await ctx.db.get("subscribers", id),
});

/** Everyone still subscribed. */
export const active = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("subscribers").take(3000)).filter((s) => !s.off),
});

/** Careers-board roles saved since a time, newest first. LinkedIn rows stay out: they're for members only. */
export const newRoles = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const out = [];
    for await (const r of ctx.db.query("careerJobs").order("desc")) {
      if (r._creationTime < since || out.length >= 3000) break;
      if (r.externalId.startsWith("linkedin:")) continue;
      out.push({ externalId: r.externalId, company: r.company, title: r.title, location: r.location, workSetting: r.workSetting, url: r.url, india: r.india, at: r._creationTime });
    }
    return out;
  },
});

export const markSent = internalMutation({
  args: { id: v.id("subscribers"), at: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, at }) => {
    await ctx.db.patch("subscribers", id, { sentAt: at });
    return null;
  },
});

/** A member's unsubscribe secret, made the first time it's needed. */
export const memberKey = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.string(),
  handler: async (ctx, { accessId }) => {
    const row = await ctx.db.get("access", accessId);
    if (!row) throw new Error("No such member");
    if (row.unsubKey) return row.unsubKey;
    const key = newKey();
    await ctx.db.patch("access", accessId, { unsubKey: key });
    return key;
  },
});

/** Stops the jobs emails for whoever holds this link: a subscriber, or a member's daily email. False for an unknown key. */
export async function unsubscribeKey(ctx: MutationCtx, key: string) {
  if (!key || key.length > 64) return false;
  const sub = await ctx.db.query("subscribers").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (sub) {
    await ctx.db.patch("subscribers", sub._id, { off: true });
    return true;
  }
  const member = await ctx.db.query("access").withIndex("by_unsubKey", (q) => q.eq("unsubKey", key)).unique();
  if (member) {
    await ctx.db.patch("access", member._id, { alertsOff: true });
    return true;
  }
  return false;
}

export const unsubscribe = internalMutation({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { key }) => await unsubscribeKey(ctx, key),
});

/** For the owner: how many subscribed, and how many still on. npx convex run --prod subscribers:count */
export const count = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("subscribers").take(3000);
    const on = rows.filter((r) => !r.off);
    return { total: rows.length, on: on.length, sentToday: on.filter((r) => r.sentAt && Date.now() - r.sentAt < DAY).length };
  },
});
