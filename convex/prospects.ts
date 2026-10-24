import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { companyKey } from "./lib/company";
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

/** Changes one person on a company, read fresh here, so edits made while the AI was working aren't overwritten. */
export const updateContactForAction = internalMutation({
  args: { userId: v.id("users"), prospectId: v.id("prospects"), contactId: v.string(), patch: hiringContactV.omit("id").partial() },
  handler: async (ctx, { userId, prospectId, contactId, patch }) => {
    const p = await ownProspect(ctx, userId, prospectId);
    const contacts = p.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c));
    await ctx.db.patch("prospects", prospectId, { contacts, updatedAt: Date.now() });
    return null;
  },
});

/** Saves a person found by name: updates them if already saved, otherwise adds them. */
export const upsertContactForAction = internalMutation({
  args: { userId: v.id("users"), prospectId: v.id("prospects"), contact: hiringContactV },
  handler: async (ctx, { userId, prospectId, contact }) => {
    const p = await ownProspect(ctx, userId, prospectId);
    const same = p.contacts.find((c) => c.name.toLowerCase() === contact.name.toLowerCase());
    const contacts = same
      ? p.contacts.map((c) => (c.id === same.id ? { ...c, ...contact, id: c.id, email: c.email || contact.email, phone: c.phone || contact.phone, linkedinUrl: contact.linkedinUrl || c.linkedinUrl, profileText: c.profileText } : c))
      : [...p.contacts, contact];
    await ctx.db.patch("prospects", prospectId, { contacts, updatedAt: Date.now() });
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

/** Puts a company on or off your Dream 20. */
export const setDream = mutation({
  args: { prospectId: v.id("prospects"), dream: v.boolean() },
  handler: async (ctx, { prospectId, dream }) => {
    const userId = await requireUserId(ctx);
    await ownProspect(ctx, userId, prospectId);
    await ctx.db.patch("prospects", prospectId, { dream, updatedAt: Date.now() });
    return null;
  },
});

/** Adds a company to your Dream 20 by name, or marks it if it's already in your list. */
export const addDream = mutation({
  args: { name: v.string(), website: v.optional(v.string()) },
  handler: async (ctx, { name, website }) => await addDreamFor(ctx, await requireUserId(ctx), name, website),
});

export const addDreamForAction = internalMutation({
  args: { userId: v.id("users"), name: v.string() },
  handler: async (ctx, { userId, name }) => await addDreamFor(ctx, userId, name),
});

async function addDreamFor(ctx: MutationCtx, userId: Id<"users">, name: string, website?: string) {
  const clean = name.trim();
  if (!clean) throw new ConvexError("Type a company name.");
  const key = companyKey(clean);
  const existing = await ctx.db.query("prospects").withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", key)).first();
  if (existing) {
    await ctx.db.patch("prospects", existing._id, { dream: true, status: existing.status === "skip" ? "new" : existing.status, updatedAt: Date.now() });
    return existing._id;
  }
  const all = await ctx.db.query("prospects").withIndex("by_userId", (q) => q.eq("userId", userId)).take(1000);
  if (all.filter((d) => d.dream).length >= 30) throw new ConvexError("Your dream list is full at 30. Take one off first.");
  return await ctx.db.insert("prospects", {
    userId, key, name: clean, website: website?.trim() ?? "", source: "manual", oneLiner: "", industry: "", location: "",
    dream: true, status: "new", contacts: [], updatedAt: Date.now(),
  });
}

export const dreamsForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query("prospects").withIndex("by_userId", (q) => q.eq("userId", userId)).take(1000);
    return rows.filter((r) => r.dream && r.status !== "skip").slice(0, 30);
  },
});

export const recordRoles = internalMutation({
  args: { userId: v.id("users"), prospectId: v.id("prospects"), openRoles: v.number(), details: v.optional(v.object({ website: v.string(), oneLiner: v.string(), industry: v.string(), location: v.string(), whyDream: v.string() })) },
  handler: async (ctx, { userId, prospectId, openRoles, details }) => {
    await ownProspect(ctx, userId, prospectId);
    await ctx.db.patch("prospects", prospectId, { openRoles, rolesCheckedAt: Date.now(), ...(details ?? {}) });
    return null;
  },
});
