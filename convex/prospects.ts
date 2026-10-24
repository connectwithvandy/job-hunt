import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { hiringContactV, prospectFields } from "./lib/validators";

const statusV = prospectFields.status;

async function ownProspect(ctx: QueryCtx, userId: Id<"users">, prospectId: Id<"prospects">) {
  const p = await ctx.db.get("prospects", prospectId);
  if (!p || p.userId !== userId) throw new ConvexError("Company not found.");
  return p;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db.query("prospects").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(400);
  },
});

export const setStatus = mutation({
  args: { prospectId: v.id("prospects"), status: statusV },
  handler: async (ctx, { prospectId, status }) => {
    const userId = await requireUserId(ctx);
    await ownProspect(ctx, userId, prospectId);
    await ctx.db.patch("prospects", prospectId, { status, updatedAt: Date.now() });
    return null;
  },
});

export const saveContacts = mutation({
  args: { prospectId: v.id("prospects"), contacts: v.array(hiringContactV) },
  handler: async (ctx, { prospectId, contacts }) => {
    const userId = await requireUserId(ctx);
    await ownProspect(ctx, userId, prospectId);
    if (contacts.length > 10) throw new ConvexError("Keep up to 10 people per company.");
    if (contacts.some((c) => !c.name.trim())) throw new ConvexError("Each person needs a name.");
    await ctx.db.patch("prospects", prospectId, { contacts, status: "approaching", updatedAt: Date.now() });
    return null;
  },
});

/** Saves companies not already in your list. Returns the ids of the new ones. */
export const insertMany = internalMutation({
  args: { userId: v.id("users"), prospects: v.array(v.object(prospectFields)) },
  handler: async (ctx, { userId, prospects }) => {
    const added: Id<"prospects">[] = [];
    for (const p of prospects) {
      const existing = await ctx.db
        .query("prospects")
        .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", p.key))
        .first();
      if (existing) {
        // Keep the newest funding news on a company you already have.
        if (p.funding && p.funding !== existing.funding) await ctx.db.patch("prospects", existing._id, { funding: p.funding, fundingSource: p.fundingSource });
        continue;
      }
      added.push(await ctx.db.insert("prospects", { userId, ...p }));
    }
    return added;
  },
});

export const keysForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query("prospects").withIndex("by_userId", (q) => q.eq("userId", userId)).take(1000);
    return rows.map((r) => r.key);
  },
});

export const forAction = internalQuery({
  args: { userId: v.id("users"), ids: v.array(v.id("prospects")) },
  handler: async (ctx, { userId, ids }) => {
    const rows = await Promise.all(ids.slice(0, 40).map((id) => ctx.db.get("prospects", id)));
    return rows.filter((r) => !!r && r.userId === userId).map((r) => r!);
  },
});

export const patchForAction = internalMutation({
  args: {
    userId: v.id("users"),
    prospectId: v.id("prospects"),
    fit: v.optional(prospectFields.fit),
    contacts: v.optional(v.array(hiringContactV)),
  },
  handler: async (ctx, { userId, prospectId, ...patch }) => {
    await ownProspect(ctx, userId, prospectId);
    await ctx.db.patch("prospects", prospectId, { ...patch, updatedAt: Date.now() });
    return null;
  },
});

export const topForChat = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query("prospects").withIndex("by_userId", (q) => q.eq("userId", userId)).take(300);
    return rows
      .filter((r) => r.status !== "skip")
      .sort((a, b) => (b.fit?.score ?? 0) - (a.fit?.score ?? 0))
      .slice(0, 20);
  },
});
