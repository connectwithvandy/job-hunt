import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { companyKey } from "./lib/company";
import { contactsAt } from "./jobs";

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
/** Each company in your job list where you know someone: its open jobs, your connections there, and the referral notes so far. */
export const warmCompanies = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(300);
    const byCompany = new Map<string, { company: string; jobs: { _id: Id<"jobs">; title: string; status: Doc<"jobs">["status"]; outreach: Doc<"jobs">["outreach"] }[] }>();
    for (const j of jobs) {
      if (j.status === "dismissed" || j.status === "rejected") continue;
      const k = companyKey(j.company);
      const job = { _id: j._id, title: j.title, status: j.status, outreach: j.outreach };
      const e = byCompany.get(k);
      if (e) e.jobs.push(job);
      else byCompany.set(k, { company: j.company, jobs: [job] });
    }
    const out = [];
    // Each company costs several lookups; the 80 you have most jobs at are plenty for this page.
    const top = [...byCompany.values()].sort((a, b) => b.jobs.length - a.jobs.length).slice(0, 80);
    for (const c of top) {
      const people = await contactsAt(ctx, userId, c.company);
      // A job you already asked about comes first, so its notes stay in view.
      c.jobs.sort((a, b) => b.outreach.length - a.outreach.length);
      if (people.length) out.push({ company: c.company, jobs: c.jobs.slice(0, 5), people: people.slice(0, 8), peopleCount: people.length });
    }
    return out.sort((a, b) => b.jobs[0].outreach.length - a.jobs[0].outreach.length || b.peopleCount - a.peopleCount);
  },
});
