import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUserId } from "./lib/auth";
import { companyKey, referralRank, roleKey } from "./lib/company";
import { unverifiedNumbers } from "./lib/facts";
import { hiringContactV, jobFields, resumeV, jobStatusV, outreachStatusV, outreachV, packV, prepV, researchV, scoreV } from "./lib/validators";

async function ownJob(ctx: QueryCtx, userId: Id<"users">, jobId: Id<"jobs">) {
  const job = await ctx.db.get("jobs", jobId);
  if (!job || job.userId !== userId) throw new ConvexError("Job not found.");
  return job;
}

type Details = Partial<Pick<Doc<"jobDetails">, "description" | "pack" | "research" | "prep">>;

async function detailsOf(ctx: QueryCtx, jobId: Id<"jobs">) {
  return await ctx.db.query("jobDetails").withIndex("by_jobId", (q) => q.eq("jobId", jobId)).unique();
}

/** A job with its heavy parts filled in, whether they're still on the job or already in jobDetails. */
async function withDetails(ctx: QueryCtx, job: Doc<"jobs">): Promise<Doc<"jobs">> {
  const d = await detailsOf(ctx, job._id);
  if (!d) return job;
  return { ...job, description: d.description ?? job.description, pack: d.pack ?? job.pack, research: d.research ?? job.research, prep: d.prep ?? job.prep };
}

const defined = (o: Details) => Object.fromEntries(Object.entries(o).filter(([, val]) => val !== undefined)) as Details;

/** Saves heavy parts to jobDetails, moving any still on the job there too, so the job itself stays light. */
async function saveDetails(ctx: MutationCtx, job: Doc<"jobs">, fields: Details) {
  const d = await detailsOf(ctx, job._id);
  const onJob = defined({ description: job.description, pack: job.pack, research: job.research, prep: job.prep });
  const next = { ...onJob, ...defined(fields) };
  if (d) await ctx.db.patch("jobDetails", d._id, next);
  else if (Object.keys(next).length) await ctx.db.insert("jobDetails", { jobId: job._id, userId: job.userId, ...next });
  const hasPack = !!(next.pack ?? d?.pack);
  if (Object.keys(onJob).length || hasPack !== !!job.hasPack) {
    await ctx.db.patch("jobs", job._id, { description: undefined, pack: undefined, research: undefined, prep: undefined, hasPack });
  }
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
    // Jobs not moved to jobDetails yet still carry their heavy parts; leave them out of the list.
    return jobs.map((j) => ({ ...j, description: undefined, pack: undefined, research: undefined, prep: undefined, hasPack: !!j.hasPack || !!j.pack }));
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
    return { job: await withDetails(ctx, job), people };
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

/** Moves several jobs at once, e.g. marking a batch "Not for me". */
export const setStatusMany = mutation({
  args: { jobIds: v.array(v.id("jobs")), status: jobStatusV },
  handler: async (ctx, { jobIds, status }) => {
    const userId = await requireUserId(ctx);
    if (jobIds.length > 200) throw new ConvexError("Pick up to 200 jobs at a time.");
    for (const jobId of jobIds) {
      await ownJob(ctx, userId, jobId);
      await ctx.db.patch("jobs", jobId, { status, updatedAt: Date.now() });
    }
    return null;
  },
});

export const saveCoverLetter = mutation({
  args: { jobId: v.id("jobs"), text: v.string() },
  handler: async (ctx, { jobId, text }) => {
    const userId = await requireUserId(ctx);
    const job = await withDetails(ctx, await ownJob(ctx, userId, jobId));
    if (!job.pack) throw new ConvexError("Tailor the CV first.");
    await saveDetails(ctx, job, { pack: { ...job.pack, coverLetter: text } });
    await ctx.db.patch("jobs", jobId, { updatedAt: Date.now() });
    return null;
  },
});

/** Saves your edits to the tailored CV, and re-checks its numbers against all your master CVs. */
export const saveTailoredResume = mutation({
  args: { jobId: v.id("jobs"), resume: resumeV },
  handler: async (ctx, { jobId, resume }) => {
    const userId = await requireUserId(ctx);
    const job = await withDetails(ctx, await ownJob(ctx, userId, jobId));
    if (!job.pack) throw new ConvexError("Write the CV first.");
    const masters = await ctx.db.query("resumes").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20);
    const p = job.pack;
    const texts = [resume.headline, resume.summary, ...resume.experience.flatMap((e) => e.bullets), p.coverLetter, p.directNote ?? "", p.email ?? ""];
    const unverified = unverifiedNumbers(masters.map((m) => m.resume), texts);
    await saveDetails(ctx, job, { pack: { ...p, resume, unverified } });
    await ctx.db.patch("jobs", jobId, { updatedAt: Date.now() });
    return unverified;
  },
});

/** Saves your edits to one of the written messages. */
export const savePackText = mutation({
  args: { jobId: v.id("jobs"), field: v.union(v.literal("directNote"), v.literal("emailSubject"), v.literal("email")), text: v.string() },
  handler: async (ctx, { jobId, field, text }) => {
    const userId = await requireUserId(ctx);
    const job = await withDetails(ctx, await ownJob(ctx, userId, jobId));
    if (!job.pack) throw new ConvexError("Write the CV and messages first.");
    await saveDetails(ctx, job, { pack: { ...job.pack, [field]: text } });
    await ctx.db.patch("jobs", jobId, { updatedAt: Date.now() });
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
  handler: async (ctx, { userId, jobId }) => await withDetails(ctx, await ownJob(ctx, userId, jobId)),
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
      const { description, pack, research, prep, ...light } = job;
      lastId = await ctx.db.insert("jobs", { userId, ...light, roleKey: key, hasPack: !!pack });
      if (description || pack || research || prep) await ctx.db.insert("jobDetails", { jobId: lastId, userId, ...defined({ description, pack, research, prep }) });
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
  handler: async (ctx, { userId, jobId, description, pack, ...fields }) => {
    const job = await ownJob(ctx, userId, jobId);
    if (description !== undefined || pack !== undefined) await saveDetails(ctx, job, { description, pack });
    const change = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined));
    await ctx.db.patch("jobs", jobId, {
      ...change,
      ...(pack && job.status === "new" ? { status: "applying" as const } : {}),
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
    await saveDetails(ctx, await ownJob(ctx, userId, jobId), extras);
    return null;
  },
});

export const saveContactsForAction = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), contacts: v.array(hiringContactV) },
  handler: async (ctx, { userId, jobId, contacts }) => {
    await ownJob(ctx, userId, jobId);
    await ctx.db.patch("jobs", jobId, { hiringContacts: contacts, updatedAt: Date.now() });
    return null;
  },
});

/** Changes one saved contact, read fresh here, so edits made while the AI was working aren't overwritten. */
export const updateContactForAction = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), contactId: v.string(), patch: hiringContactV.omit("id").partial() },
  handler: async (ctx, { userId, jobId, contactId, patch }) => {
    const job = await ownJob(ctx, userId, jobId);
    const hiringContacts = (job.hiringContacts ?? []).map((c) => (c.id === contactId ? { ...c, ...patch } : c));
    await ctx.db.patch("jobs", jobId, { hiringContacts, updatedAt: Date.now() });
    return null;
  },
});

/** Adds or rewrites referral notes by contact, keeping statuses and edits made meanwhile. */
export const mergeOutreachForAction = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), entries: v.array(outreachV) },
  handler: async (ctx, { userId, jobId, entries }) => {
    const job = await ownJob(ctx, userId, jobId);
    const outreach = [...job.outreach];
    for (const entry of entries) {
      const i = outreach.findIndex((o) => o.contactId === entry.contactId);
      if (i === -1) outreach.push(entry);
      else outreach[i] = { ...outreach[i], message: entry.message };
    }
    await ctx.db.patch("jobs", jobId, { outreach, updatedAt: Date.now() });
    return null;
  },
});

/** Every written message across your jobs, for the Messages page. Newest jobs first. */
export const messages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(400);
    // Only jobs with something written need their details loaded.
    const written = jobs.filter((j) => j.status !== "dismissed" && (j.hasPack || j.pack || j.outreach.length)).slice(0, 150);
    const full = await Promise.all(written.map((j) => withDetails(ctx, j)));
    return full
      .filter((j) => j.pack?.directNote || j.outreach.length)
      .map((j) => ({
        _id: j._id,
        title: j.title,
        company: j.company,
        status: j.status,
        updatedAt: j.updatedAt,
        packCreatedAt: j.pack?.createdAt ?? 0,
        directNote: j.pack?.directNote,
        emailSubject: j.pack?.emailSubject,
        email: j.pack?.email,
        hiringContacts: j.hiringContacts ?? [],
        outreach: j.outreach,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** The jobs the assistant should know about: everything in play, strongest first. */
export const recentForChat = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(300);
    const best = (j: (typeof jobs)[number]) => Math.max(-1, ...(j.scores ?? []).map((s) => s.score));
    return jobs
      .filter((j) => j.status !== "dismissed")
      .sort((a, b) => Number(b.status !== "new") - Number(a.status !== "new") || best(b) - best(a))
      .slice(0, 40)
      .map((j) => ({ ...j, description: undefined, pack: undefined, research: undefined, prep: undefined }));
  },
});

export const setStatusForAction = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), status: jobStatusV },
  handler: async (ctx, { userId, jobId, status }) => {
    const job = await ownJob(ctx, userId, jobId);
    await ctx.db.patch("jobs", jobId, { status, appliedAt: status === "applied" && !job.appliedAt ? Date.now() : job.appliedAt, updatedAt: Date.now() });
    return { title: job.title, company: job.company };
  },
});

/** One-off: move every job's heavy parts into jobDetails, 50 jobs at a time. Run with `npx convex run --prod jobs:moveDetails`. */
export const moveDetails = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("jobs").paginate({ cursor: cursor ?? null, numItems: 50 });
    let moved = 0;
    for (const job of page.page) {
      if (job.description !== undefined || job.pack !== undefined || job.research !== undefined || job.prep !== undefined) {
        await saveDetails(ctx, job, {});
        moved++;
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.jobs.moveDetails, { cursor: page.continueCursor });
    return { moved, done: page.isDone };
  },
});
