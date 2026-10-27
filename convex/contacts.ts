import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { companyKey } from "./lib/company";
import { SKIP_BELOW } from "./lib/posting";
import { contactsAt } from "./jobs";
import { chatRowV, withChats } from "./lib/chats";

const rowV = v.object({
  linkedinUrl: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  company: v.string(),
  position: v.string(),
  connectedOn: v.string(),
});

async function bumpCount(ctx: MutationCtx, userId: Id<"users">, delta: number | "reset") {
  const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  if (!profile) return;
  await ctx.db.patch("profiles", profile._id, { contactsCount: delta === "reset" ? 0 : (profile.contactsCount ?? 0) + delta });
}

/** The browser parses LinkedIn's Connections.csv and sends it here in batches. */
export const importBatch = mutation({
  args: { rows: v.array(rowV) },
  handler: async (ctx, { rows }) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if ((profile?.contactsCount ?? 0) + rows.length > 30_000) throw new ConvexError("That's over 30,000 connections, the most the app keeps.");
    for (const r of rows.slice(0, 500)) {
      await ctx.db.insert("contacts", { userId, ...r, companyKey: companyKey(r.company) });
    }
    await bumpCount(ctx, userId, Math.min(rows.length, 500));
    return null;
  },
});

/** Delete your connections in chunks; call until it returns false. */
export const clearBatch = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db.query("contacts").withIndex("by_userId_and_companyKey", (q) => q.eq("userId", userId)).take(1000);
    for (const r of rows) await ctx.db.delete("contacts", r._id);
    if (rows.length < 1000) await bumpCount(ctx, userId, "reset");
    return rows.length === 1000;
  },
});

/** Companies in your job list where you know someone. */
/** The browser reads LinkedIn's messages.csv and sends a short summary per person here, in batches. */
export const importChats = mutation({
  args: { rows: v.array(chatRowV) },
  handler: async (ctx, { rows }) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if ((profile?.chatsCount ?? 0) + rows.length > 20_000) throw new ConvexError("That's chats with over 20,000 people, the most the app keeps.");
    const batch = rows.slice(0, 200);
    for (const r of batch) {
      await ctx.db.insert("linkedinChats", { userId, ...r, recent: r.recent.slice(-4).map((m) => ({ ...m, text: m.text.slice(0, 300) })) });
    }
    if (profile) await ctx.db.patch("profiles", profile._id, { chatsCount: (profile.chatsCount ?? 0) + batch.length, chatsAt: Date.now() });
    return null;
  },
});

/** Delete your loaded chats in chunks; call until it returns false. */
export const clearChats = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db.query("linkedinChats").withIndex("by_userId_and_profileKey", (q) => q.eq("userId", userId)).take(500);
    for (const r of rows) await ctx.db.delete("linkedinChats", r._id);
    if (rows.length < 500) {
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
      if (profile) await ctx.db.patch("profiles", profile._id, { chatsCount: 0 });
    }
    return rows.length === 500;
  },
});

/**
 * Your top 50 companies to reach out to, best first: where several roles fit you, you know people,
 * the company raised money lately, or it's on your dream list. Each with its open jobs, your
 * connections there and the referral notes so far. The first 20 are your Dream 20.
 */
export const warmCompanies = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(600);
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    // Funding and dream marks come from the Companies page.
    const prospects = await ctx.db.query("prospects").withIndex("by_userId", (q) => q.eq("userId", userId)).take(400);
    const prospectByKey = new Map(prospects.map((p) => [companyKey(p.name), p]));
    // Queries can't read the clock, so "now" is your last visit.
    const now = profile?.lastSeenAt ?? 0;
    const byCompany = new Map<string, { company: string; jobs: { _id: Id<"jobs">; title: string; status: Doc<"jobs">["status"]; outreach: Doc<"jobs">["outreach"]; fit: number }[] }>();
    for (const j of jobs) {
      if (j.status === "dismissed" || j.status === "rejected") continue;
      // A closed posting, or a new one up for over 45 days, is likely filled: not worth asking a friend about.
      // Jobs you already asked about stay, so their notes don't vanish.
      const posted = j.postedAt ? Date.parse(j.postedAt) : j._creationTime;
      const stale = j.liveCheck?.state === "closed" || (j.status === "new" && now - posted > 45 * 86_400_000);
      if (stale && !j.outreach.length) continue;
      const k = companyKey(j.company);
      // The AI fit score when there is one, else the free first guess.
      const fit = Math.max(...(j.scores ?? []).map((x) => x.score), j.quickFit ?? 0);
      const job = { _id: j._id, title: j.title, status: j.status, outreach: j.outreach, fit };
      const e = byCompany.get(k);
      if (e) e.jobs.push(job);
      else byCompany.set(k, { company: j.company, jobs: [job] });
    }
    const out = [];
    // Each company costs several lookups; the 100 you have most jobs at are plenty for this page.
    const top = [...byCompany.entries()].sort((a, b) => b[1].jobs.length - a[1].jobs.length).slice(0, 100);
    for (const [key, c] of top) {
      const people = await contactsAt(ctx, userId, c.company);
      if (!people.length) continue;
      // A job you already asked about comes first, so its notes stay in view; then your best fit.
      c.jobs.sort((a, b) => b.outreach.length - a.outreach.length || b.fit - a.fit);
      const prospect = prospectByKey.get(key);
      const fitting = c.jobs.filter((j) => j.fit >= SKIP_BELOW).length;
      const best = Math.max(...c.jobs.map((j) => j.fit));
      // Several roles that fit means several ways in; people you know make it warm; fresh money means they're building.
      const score = Math.min(fitting, 4) * 12 + best * 0.4 + Math.min(people.length, 10) * 2 + (prospect?.funding ? 12 : 0) + (prospect?.dream ? 15 : 0);
      out.push({ key, company: c.company, jobs: c.jobs, people, peopleCount: people.length, fitting, score, funding: prospect?.funding ?? null, dream: !!prospect?.dream });
    }
    const ranked = out.sort((a, b) => b.score - a.score).slice(0, 50);
    // Only the 50 shown pay for the chat lookups: the best dozen by role, re-ranked so people you talk to come first.
    return await Promise.all(
      ranked.map(async (c) => ({
        ...c,
        jobs: c.jobs.slice(0, 5),
        people: (await withChats(ctx, userId, c.people.slice(0, 12), profile?.chatsAt ?? 0)).slice(0, 8),
      })),
    );
  },
});
