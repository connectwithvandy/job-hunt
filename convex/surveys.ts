// The timed "how's it going" pop-up: which question to show, saving the answer, and the owner's view of answers.
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { hasAccess, isOwnerEmail, requireUserId } from "./lib/auth";
import { nextSurvey, SURVEY_CHOICES } from "./lib/survey";

const kindV = v.union(v.literal("found_jobs"), v.literal("recommend"), v.literal("interviews"));

/**
 * The question to show this person now, or null.
 * now comes from the browser (rounded to the hour) because queries can't read the clock.
 * Only for people let in from the waitlist who have used the app: at least one job found.
 */
export const next = query({
  args: { now: v.number() },
  returns: v.union(v.null(), v.object({ kind: kindV, round: v.number() })),
  handler: async (ctx, { now }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || !(await hasAccess(ctx, userId))) return null;
    const user = await ctx.db.get("users", userId);
    if (isOwnerEmail(user?.email)) return null;
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const startedAt = row?.decidedAt ?? row?.welcomedAt;
    if (!startedAt) return null;
    const usedIt = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).first();
    if (!usedIt) return null;
    const past = await ctx.db
      .query("surveyAnswers")
      .withIndex("by_userId_and_kind_and_round", (q) => q.eq("userId", userId))
      .take(200);
    return nextSurvey(startedAt, now, past.map((p) => ({ kind: p.kind, round: p.round, at: p._creationTime })));
  },
});

/** Save an answer, or that they closed the pop-up. A second answer to the same question is ignored. */
export const answer = mutation({
  args: {
    kind: kindV,
    round: v.number(),
    skipped: v.boolean(),
    choice: v.optional(v.string()),
    score: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { kind, round, skipped, choice, score, note }) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(round) || round < 0 || round > 1000) throw new ConvexError("That question isn't valid.");
    if (!skipped) {
      if (kind === "recommend") {
        if (score === undefined || !Number.isInteger(score) || score < 0 || score > 10) throw new ConvexError("Pick a number from 0 to 10.");
      } else if (!choice || !(SURVEY_CHOICES[kind] as readonly string[]).includes(choice)) {
        throw new ConvexError("Pick one of the answers.");
      }
    }
    const text = note?.trim().slice(0, 2000) || undefined;
    const already = await ctx.db
      .query("surveyAnswers")
      .withIndex("by_userId_and_kind_and_round", (q) => q.eq("userId", userId).eq("kind", kind).eq("round", round))
      .first();
    if (already) return null;
    const user = await ctx.db.get("users", userId);
    await ctx.db.insert("surveyAnswers", {
      userId,
      email: user?.email ?? "",
      kind,
      round,
      skipped,
      choice: skipped || kind === "recommend" ? undefined : choice,
      score: skipped || kind !== "recommend" ? undefined : score,
      note: text,
    });
    return null;
  },
});

/** The latest pop-up answers, newest first. Owner only. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get("users", userId) : null;
    if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can read these.");
    return await ctx.db.query("surveyAnswers").order("desc").take(300);
  },
});
