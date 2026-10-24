import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUserId } from "./lib/auth";
import { companyKey, referralRank, roleKey } from "./lib/company";
import { hiringContactV, jobFields, jobStatusV, outreachStatusV, outreachV, packV, prepV, researchV, scoreV } from "./lib/validators";

async function ownJob(ctx: QueryCtx, userId: Id<"users">, jobId: Id<"jobs">) {
  const job = await ctx.db.get("jobs", jobId);
  if (!job || job.userId !== userId) throw new ConvexError("Job not found.");
  return job;
}

/** Connections whose company matches: same name, or one name is the other plus a suffix like "Scientific". */
export async function contactsAt(ctx: QueryCtx, userId: Id<"users">, company: string) {
  const key = companyKey(company);
  if (key.length < 2) return [];
  const found = new Map<string, Doc<"contacts">>();
  const longer =
    key.length >= 5
      ? ctx.db.query("contacts").withIndex("by_userId_and_companyKey", (q) =>
          q.eq("userId", userId).gte("companyKey", key).lt("companyKey", key + "￿"),
        )
      : ctx.db.query("contacts").withIndex("by_userId_and_companyKey", (q) => q.eq("userId", userId).eq("companyKey", key));
  for (const c of await longer.take(60)) found.set(c._id, c);
  for (let n = 6; n < key.length; n++) {
    const prefix = key.slice(0, n);
    for (const c of await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_companyKey", (q) => q.eq("userId", userId).eq("companyKey", prefix))
      .take(20)) {
      found.set(c._id, c);
    }
  }
  return [...found.values()].sort((a, b) => referralRank(b.position) - referralRank(a.position));
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(500);
    // The list doesn't need long descriptions or the tailored CV; keep the payload small.
    return jobs.map((j) => ({ ...j, description: undefined, pack: undefined, research: undefined, prep: undefined, hasPack: !!j.pack }));
  },
});

export const get = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const job = await ctx.db.get("jobs", jobId);
    if (!job || job.userId !== userId) return null;
    const people = await contactsAt(ctx, userId, job.company);
    return { job, people };
  },
});

export const setStatus = mutation({
  args: { jobId: v.id("jobs"), status: jobStatusV },
  handler: async (ctx, { jobId, status }) => {
    const userId = await requireUserId(ctx);
    const job = await ownJob(ctx, userId, jobId);
    await ctx.db.patch("jobs", jobId, {
      status,
      appliedAt: status === "applied" && !job.appliedAt ? Date.now() : job.appliedAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const saveCoverLetter = mutation({
  args: { jobId: v.id("jobs"), text: v.string() },
  handler: async (ctx, { jobId, text }) => {
    const userId = await requireUserId(ctx);
    const job = await ownJob(ctx, userId, jobId);
    if (!job.pack) throw new ConvexError("Tailor the CV first.");
    await ctx.db.patch("jobs", jobId, { pack: { ...job.pack, coverLetter: text }, updatedAt: Date.now() });
    return null;
  },
});

/** Saves your edits to one of the written messages. */
export const savePackText = mutation({
  args: { jobId: v.id("jobs"), field: v.union(v.literal("directNote"), v.literal("emailSubject"), v.literal("email")), text: v.string() },
  handler: async (ctx, { jobId, field, text }) => {
    const userId = await requireUserId(ctx);
    const job = await ownJob(ctx, userId, jobId);
    if (!job.pack) throw new ConvexError("Write the CV and messages first.");
    await ctx.db.patch("jobs", jobId, { pack: { ...job.pack, [field]: text }, updatedAt: Date.now() });
    return null;
  },
});

export const saveHiringContacts = mutation({
  args: { jobId: v.id("jobs"), contacts: v.array(hiringContactV) },
  handler: async (ctx, { jobId, contacts }) => {
    const userId = await requireUserId(ctx);
    await ownJob(ctx, userId, jobId);
    if (contacts.length > 10) throw new ConvexError("Keep up to 10 people per job.");
    if (contacts.some((c) => !c.name.trim())) throw new ConvexError("Each person needs a name.");
    await ctx.db.patch("jobs", jobId, { hiringContacts: contacts, updatedAt: Date.now() });
    return null;
  },
});

export const setOutreach = mutation({
  args: { jobId: v.id("jobs"), contactId: v.string(), status: outreachStatusV, message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ownJob(ctx, userId, args.jobId);
    await ctx.db.patch("jobs", args.jobId, {
      outreach: job.outreach.map((o) =>
        o.contactId === args.contactId
          ? { ...o, status: args.status, message: args.message ?? o.message, sentAt: args.status === "sent" && !o.sentAt ? Date.now() : o.sentAt }
          : o,
      ),
      updatedAt: Date.now(),
    });
    return null;
  },
});

// ---------- For actions ----------

export const forAction = internalQuery({
  args: { userId: v.id("users"), jobId: v.id("jobs") },
  handler: async (ctx, { userId, jobId }) => ownJob(ctx, userId, jobId),
});

export const contactsForAction = internalQuery({
  args: { userId: v.id("users"), ids: v.array(v.id("contacts")) },
  handler: async (ctx, { userId, ids }) => {
    const rows = await Promise.all(ids.slice(0, 10).map((id) => ctx.db.get("contacts", id)));
    return rows.filter((c): c is Doc<"contacts"> => !!c && c.userId === userId);
  },
});

/** Insert jobs that aren't already in the list. Returns how many were new. */
export const insertMany = internalMutation({
  args: { userId: v.id("users"), jobs: v.array(v.object(jobFields)) },
  handler: async (ctx, { userId, jobs }) => {
    let added = 0;
    let lastId: Id<"jobs"> | null = null;
    for (const job of jobs) {
      const key = roleKey(job.company, job.title);
      const existing =
        (await ctx.db
          .query("jobs")
          .withIndex("by_userId_and_externalId", (q) => q.eq("userId", userId).eq("externalId", job.externalId))
          .unique()) ??
        (await ctx.db
          .query("jobs")
          .withIndex("by_userId_and_roleKey", (q) => q.eq("userId", userId).eq("roleKey", key))
          .first());
      if (existing) {
        lastId = existing._id;
        continue;
      }
      lastId = await ctx.db.insert("jobs", { userId, ...job, roleKey: key });
      added++;
    }
    return { added, lastId };
  },
});

export const patchForAction = internalMutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    description: v.optional(v.string()),
    companyLogo: v.optional(v.string()),
    seniority: v.optional(v.string()),
    scores: v.optional(v.array(scoreV)),
    brief: v.optional(v.object({ whatTheyWant: v.string(), watchOuts: v.string() })),
    pack: v.optional(packV),
    trackKey: v.optional(v.string()),
    outreach: v.optional(v.array(outreachV)),
  },
  handler: async (ctx, { userId, jobId, ...fields }) => {
    const job = await ownJob(ctx, userId, jobId);
    const change = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined));
    await ctx.db.patch("jobs", jobId, {
      ...change,
      ...(fields.pack && job.status === "new" ? { status: "applying" as const } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** One-off: give jobs saved before role keys existed a key, a page at a time. */
export const backfillRoleKeys = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("jobs").paginate({ cursor, numItems: 100 });
    for (const job of page.page) {
      if (!job.roleKey) await ctx.db.patch("jobs", job._id, { roleKey: roleKey(job.company, job.title) });
    }
    return { done: page.isDone, cursor: page.continueCursor };
  },
});

/** Newest jobs not scored yet, for the morning run. */
export const unscoredIds = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, { userId, limit }) => {
    const recent = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(300);
    return recent.filter((j) => j.status === "new" && !j.scores?.length).slice(0, limit).map((j) => j._id);
  },
});

/** How many jobs found since `since` score 75 or more. */
export const strongSince = internalQuery({
  args: { userId: v.id("users"), since: v.number() },
  handler: async (ctx, { userId, since }) => {
    const recent = await ctx.db
      .query("jobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId).gte("_creationTime", since))
      .take(300);
    return recent.filter((j) => (j.scores ?? []).some((s) => s.score >= 75)).length;
  },
});

/** Stores company research or interview prep on a job. */
export const saveExtras = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), research: v.optional(researchV), prep: v.optional(prepV) },
  handler: async (ctx, { userId, jobId, ...extras }) => {
    await ownJob(ctx, userId, jobId);
    await ctx.db.patch("jobs", jobId, extras);
    return null;
  },
});
