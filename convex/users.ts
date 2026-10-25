import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isOwnerEmail, requireUserId } from "./lib/auth";
import { resumeV, trackFields } from "./lib/validators";

async function findProfile(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
}

async function profileFor(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await findProfile(ctx, userId);
  if (existing) return existing;
  const id = await ctx.db.insert("profiles", { userId, location: "India", onboarded: false, contactsCount: 0 });
  return (await ctx.db.get("profiles", id))!;
}

async function ownResume(ctx: QueryCtx, userId: Id<"users">, resumeId: Id<"resumes">) {
  const r = await ctx.db.get("resumes", resumeId);
  if (!r || r.userId !== userId) throw new ConvexError("CV not found.");
  return r;
}

async function listResumes(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db.query("resumes").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20);
}

/** Everything the app shell needs: who you are, your CVs, your tracks. Null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    const profile = await findProfile(ctx, userId);
    const tracks = await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", userId)).take(20);
    const resumes = await listResumes(ctx, userId);
    const defaultResume = resumes.find((r) => r._id === profile?.defaultResumeId) ?? resumes[0] ?? null;
    return {
      isOwner: isOwnerEmail(user?.email),
      email: user?.email ?? "",
      onboarded: profile?.onboarded ?? false,
      location: profile?.location ?? "India",
      markets: profile?.markets ?? "",
      writingSample: profile?.writingSample ?? "",
      contactsCount: profile?.contactsCount ?? 0,
      autopilot: profile?.autopilot ?? false,
      answers: profile?.answers ?? [],
      lastAutopilot: profile?.lastAutopilot ?? null,
      prevSeenAt: profile?.prevSeenAt ?? null,
      // Names only: every page loads this, and only the CVs page needs the full text (`resumes` below).
      resumes: resumes.map((r) => ({ _id: r._id, label: r.label })),
      defaultResumeId: defaultResume?._id ?? null,
      /** The default CV, for the greeting and quick checks. */
      resume: defaultResume?.resume ?? null,
      photoUrl: profile?.photo ? await ctx.storage.getUrl(profile.photo) : null,
      tracks,
    };
  },
});

/** Notes a visit. A new visit starts after half an hour away; "new since" counts from the one before. */
export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await findProfile(ctx, userId);
    if (!profile) return null;
    const now = Date.now();
    if (profile.lastSeenAt && now - profile.lastSeenAt < 30 * 60_000) return null;
    await ctx.db.patch("profiles", profile._id, { prevSeenAt: profile.lastSeenAt ?? now, lastSeenAt: now });
    return null;
  },
});

/** Your CVs in full, for the CVs page and printing a tailored CV. */
export const resumes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return (await listResumes(ctx, userId)).map((r) => ({ _id: r._id, label: r.label, resume: r.resume }));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setPhoto = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await requireUserId(ctx);
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta) throw new ConvexError("Upload failed. Try again.");
    if (!meta.contentType?.startsWith("image/") || meta.size > 5_000_000) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("The photo should be a JPG, PNG or WebP under 5 MB.");
    }
    const profile = await profileFor(ctx, userId);
    if (profile.photo) await ctx.storage.delete(profile.photo);
    await ctx.db.patch("profiles", profile._id, { photo: storageId });
    return null;
  },
});

export const saveResume = mutation({
  args: { resumeId: v.id("resumes"), resume: resumeV },
  handler: async (ctx, { resumeId, resume }) => {
    const userId = await requireUserId(ctx);
    await ownResume(ctx, userId, resumeId);
    await ctx.db.patch("resumes", resumeId, { resume });
    return null;
  },
});

export const renameResume = mutation({
  args: { resumeId: v.id("resumes"), label: v.string() },
  handler: async (ctx, { resumeId, label }) => {
    const userId = await requireUserId(ctx);
    await ownResume(ctx, userId, resumeId);
    await ctx.db.patch("resumes", resumeId, { label: label.trim() || "CV" });
    return null;
  },
});

export const setDefaultResume = mutation({
  args: { resumeId: v.id("resumes") },
  handler: async (ctx, { resumeId }) => {
    const userId = await requireUserId(ctx);
    await ownResume(ctx, userId, resumeId);
    const profile = await profileFor(ctx, userId);
    await ctx.db.patch("profiles", profile._id, { defaultResumeId: resumeId });
    return null;
  },
});

export const deleteResume = mutation({
  args: { resumeId: v.id("resumes") },
  handler: async (ctx, { resumeId }) => {
    const userId = await requireUserId(ctx);
    await ownResume(ctx, userId, resumeId);
    const all = await listResumes(ctx, userId);
    if (all.length <= 1) throw new ConvexError("Keep at least one CV.");
    const profile = await profileFor(ctx, userId);
    const fallback = all.find((r) => r._id !== resumeId)!;
    if (profile.defaultResumeId === resumeId) await ctx.db.patch("profiles", profile._id, { defaultResumeId: fallback._id });
    // Tracks that used this CV fall back to the default.
    for (const t of await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", userId)).take(20)) {
      if (t.resumeId === resumeId) await ctx.db.patch("tracks", t._id, { resumeId: undefined });
    }
    await ctx.db.delete("resumes", resumeId);
    return null;
  },
});

export const saveTrack = mutation({
  args: trackFields,
  handler: async (ctx, track) => {
    const userId = await requireUserId(ctx);
    if (!track.name.trim() || !track.titles.length) throw new ConvexError("A track needs a name and at least one title.");
    if (track.resumeId) await ownResume(ctx, userId, track.resumeId);
    const existing = await ctx.db
      .query("tracks")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", track.key))
      .unique();
    if (existing) await ctx.db.replace("tracks", existing._id, { userId, ...track });
    else await ctx.db.insert("tracks", { userId, ...track });
    return null;
  },
});

export const completeOnboarding = mutation({
  args: { tracks: v.array(v.object(trackFields)), location: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!args.tracks.length) throw new ConvexError("Pick at least one kind of role.");
    if (!(await listResumes(ctx, userId)).length) throw new ConvexError("Upload your CV first.");
    const profile = await profileFor(ctx, userId);
    for (const track of args.tracks.slice(0, 8)) {
      const existing = await ctx.db
        .query("tracks")
        .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", track.key))
        .unique();
      if (existing) await ctx.db.replace("tracks", existing._id, { userId, ...track });
      else await ctx.db.insert("tracks", { userId, ...track });
    }
    await ctx.db.patch("profiles", profile._id, { onboarded: true, location: args.location.trim() || "India" });
    return null;
  },
});

export const setLocation = mutation({
  args: { location: v.string() },
  handler: async (ctx, { location }) => {
    const userId = await requireUserId(ctx);
    const profile = await profileFor(ctx, userId);
    await ctx.db.patch("profiles", profile._id, { location: location.trim() || "India" });
    return null;
  },
});

// ---------- For actions ----------

export const context = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    const profile = await findProfile(ctx, userId);
    const tracks = await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", userId)).take(20);
    const resumes: Doc<"resumes">[] = await listResumes(ctx, userId);
    const fallback = resumes.find((r) => r._id === profile?.defaultResumeId) ?? resumes[0];
    return {
      email: user?.email ?? "",
      location: profile?.location ?? "India",
      markets: profile?.markets ?? "",
      voice: profile?.writingSample ?? "",
      tracks,
      resume: fallback?.resume ?? null,
      resumes: resumes.map((r) => ({ _id: r._id, resume: r.resume })),
      answers: profile?.answers ?? [],
      /** The CV each track should be pitched from. */
      resumeFor: Object.fromEntries(tracks.map((t) => [t.key, (resumes.find((r) => r._id === t.resumeId) ?? fallback)?.resume ?? null])),
    };
  },
});

/** Save a CV read from an upload: replace one, or add a new one (the first becomes the default). */
export const storeParsedResume = internalMutation({
  args: { userId: v.id("users"), resume: resumeV, replaceId: v.optional(v.id("resumes")), label: v.optional(v.string()) },
  handler: async (ctx, { userId, resume, replaceId, label }) => {
    if (replaceId) {
      await ownResume(ctx, userId, replaceId);
      await ctx.db.patch("resumes", replaceId, { resume });
      return replaceId;
    }
    const existing = await listResumes(ctx, userId);
    if (existing.length >= 10) throw new ConvexError("You can keep up to 10 CVs. Delete one first.");
    const id = await ctx.db.insert("resumes", { userId, label: label?.trim() || (existing.length ? `CV ${existing.length + 1}` : "Main CV"), resume });
    const profile = await profileFor(ctx, userId);
    if (!profile.defaultResumeId) await ctx.db.patch("profiles", profile._id, { defaultResumeId: id });
    return id;
  },
});

// ---------- Autopilot ----------

export const setAutopilot = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    const userId = await requireUserId(ctx);
    const profile = await profileFor(ctx, userId);
    await ctx.db.patch("profiles", profile._id, { autopilot: on });
    return null;
  },
});

export const autopilotUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").withIndex("by_autopilot", (q) => q.eq("autopilot", true)).take(50);
    return profiles.map((p) => p.userId);
  },
});

export const recordAutopilot = internalMutation({
  args: { userId: v.id("users"), added: v.number(), scored: v.number(), strong: v.number(), funded: v.optional(v.number()) },
  handler: async (ctx, { userId, ...run }) => {
    const profile = await profileFor(ctx, userId);
    await ctx.db.patch("profiles", profile._id, { lastAutopilot: { at: Date.now(), ...run } });
    return null;
  },
});

export const saveResumeForAction = internalMutation({
  args: { userId: v.id("users"), resumeId: v.id("resumes"), resume: resumeV },
  handler: async (ctx, { userId, resumeId, resume }) => {
    await ownResume(ctx, userId, resumeId);
    await ctx.db.patch("resumes", resumeId, { resume });
    return null;
  },
});

export const saveAnswers = mutation({
  args: { answers: v.array(v.object({ question: v.string(), answer: v.string() })) },
  handler: async (ctx, { answers }) => {
    const userId = await requireUserId(ctx);
    if (answers.length > 40) throw new ConvexError("Keep up to 40 answers.");
    const profile = await profileFor(ctx, userId);
    await ctx.db.patch("profiles", profile._id, {
      answers: answers.map((a) => ({ question: a.question.trim(), answer: a.answer.trim() })).filter((a) => a.question),
    });
    return null;
  },
});

/** Adds or updates one saved answer, matched by question. */
export const saveAnswerForAction = internalMutation({
  args: { userId: v.id("users"), question: v.string(), answer: v.string() },
  handler: async (ctx, { userId, question, answer }) => {
    const profile = await profileFor(ctx, userId);
    const rest = (profile.answers ?? []).filter((a) => a.question.toLowerCase() !== question.trim().toLowerCase());
    await ctx.db.patch("profiles", profile._id, { answers: [...rest, { question: question.trim(), answer: answer.trim() }].slice(-40) });
    return null;
  },
});

export const setMarkets = mutation({
  args: { markets: v.string() },
  handler: async (ctx, { markets }) => {
    const userId = await requireUserId(ctx);
    const profile = await profileFor(ctx, userId);
    await ctx.db.patch("profiles", profile._id, { markets: markets.trim().slice(0, 300) });
    return null;
  },
});

export const setWritingSample = mutation({
  args: { sample: v.string() },
  handler: async (ctx, { sample }) => {
    const userId = await requireUserId(ctx);
    const profile = await profileFor(ctx, userId);
    await ctx.db.patch("profiles", profile._id, { writingSample: sample.trim().slice(0, 4000) });
    return null;
  },
});
