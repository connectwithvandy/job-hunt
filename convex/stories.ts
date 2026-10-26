import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { unverifiedNumbers } from "./lib/facts";
import { MAX_STORIES } from "./lib/defaults";
import { storyFields } from "./lib/validators";

const storyInV = v.object(storyFields).omit("unverified");

const sameTitle = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every number in a story checked against all your CVs, like the tailored CV's fact check. */
async function factCheck(ctx: MutationCtx, userId: Id<"users">, s: { situation: string; action: string; result: string; reflection: string }) {
  const cvs = await ctx.db.query("resumes").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20);
  return unverifiedNumbers(cvs.map((c) => c.resume), [s.situation, s.action, s.result, s.reflection]);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("stories").withIndex("by_userId", (q) => q.eq("userId", userId)).take(MAX_STORIES);
    return rows.sort((a, b) => b.usedFor.length - a.usedFor.length || b.updatedAt - a.updatedAt);
  },
});

/** Adds a story, or saves your edits to one. */
export const save = mutation({
  args: { storyId: v.optional(v.id("stories")), story: storyInV },
  handler: async (ctx, { storyId, story }) => {
    const userId = await requireUserId(ctx);
    if (!story.title.trim()) throw new ConvexError("Give the story a short title.");
    const unverified = await factCheck(ctx, userId, story);
    const fields = { ...story, title: story.title.trim(), answers: story.answers.map((a) => a.trim()).filter(Boolean).slice(0, 10), unverified, updatedAt: Date.now() };
    if (storyId) {
      const row = await ctx.db.get("stories", storyId);
      if (!row || row.userId !== userId) throw new ConvexError("That story is gone.");
      await ctx.db.patch("stories", storyId, fields);
      return unverified;
    }
    const have = await ctx.db.query("stories").withIndex("by_userId", (q) => q.eq("userId", userId)).take(MAX_STORIES);
    if (have.length >= MAX_STORIES) throw new ConvexError(`Keep up to ${MAX_STORIES} stories. Delete one you never use first.`);
    await ctx.db.insert("stories", { userId, ...fields, usedFor: [] });
    return unverified;
  },
});

export const remove = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("stories", storyId);
    if (!row || row.userId !== userId) return null;
    await ctx.db.delete("stories", storyId);
    return null;
  },
});

// ---------- For actions ----------

export const forAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await ctx.db.query("stories").withIndex("by_userId", (q) => q.eq("userId", userId)).take(MAX_STORIES),
});

/**
 * Files stories from interview prep or from your CV into the bank: new ones added while there's room,
 * ones already there marked as used for this job. Returns each story's id, in order (null when the bank was full).
 */
export const fileForAction = internalMutation({
  args: { userId: v.id("users"), jobId: v.optional(v.id("jobs")), stories: v.array(v.object({ storyId: v.optional(v.string()), story: storyInV })) },
  handler: async (ctx, { userId, jobId, stories }) => {
    const bank = await ctx.db.query("stories").withIndex("by_userId", (q) => q.eq("userId", userId)).take(MAX_STORIES);
    let room = MAX_STORIES - bank.length;
    const ids: (Id<"stories"> | null)[] = [];
    for (const { storyId, story } of stories) {
      const match = bank.find((b) => b._id === storyId) ?? bank.find((b) => sameTitle(b.title, story.title));
      if (match) {
        if (jobId && !match.usedFor.includes(jobId)) await ctx.db.patch("stories", match._id, { usedFor: [...match.usedFor, jobId].slice(-50) });
        ids.push(match._id);
        continue;
      }
      if (room <= 0) {
        ids.push(null);
        continue;
      }
      const unverified = await factCheck(ctx, userId, story);
      const id = await ctx.db.insert("stories", { userId, ...story, unverified, usedFor: jobId ? [jobId] : [], updatedAt: Date.now() });
      bank.push({ ...story, _id: id, _creationTime: Date.now(), userId, unverified, usedFor: [], updatedAt: Date.now() });
      room--;
      ids.push(id);
    }
    return ids;
  },
});
