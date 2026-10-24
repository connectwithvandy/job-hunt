import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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
export const warmCompanies = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).take(300);
    const byCompany = new Map<string, { company: string; jobId: string; jobs: number }>();
    for (const j of jobs) {
      if (j.status === "dismissed") continue;
      const k = companyKey(j.company);
      const e = byCompany.get(k);
      if (e) e.jobs++;
      else byCompany.set(k, { company: j.company, jobId: j._id, jobs: 1 });
    }
    const out = [];
    // Each company costs several lookups; the 80 you have most jobs at are plenty for this page.
    const top = [...byCompany.values()].sort((a, b) => b.jobs - a.jobs).slice(0, 80);
    for (const c of top) {
      const people = (await contactsAt(ctx, userId, c.company)).length;
      if (people) out.push({ ...c, people });
    }
    return out.sort((a, b) => b.people - a.people);
  },
});
