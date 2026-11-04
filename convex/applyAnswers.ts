// The drafted answers to a job's application form: saved after the form is read, edited by the
// candidate, and handed to the autofill bookmark (through jobpipe.in/fill) with the tailored CV.
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { internalMutation, mutation } from "./lib/functions";
import { applyFormV } from "./lib/validators";

async function ownJob(ctx: QueryCtx, userId: Id<"users">, jobId: Id<"jobs">) {
  const job = await ctx.db.get("jobs", jobId);
  if (!job || job.userId !== userId) throw new ConvexError("Job not found.");
  return job;
}

async function detailsOf(ctx: QueryCtx, jobId: Id<"jobs">) {
  return await ctx.db.query("jobDetails").withIndex("by_jobId", (q) => q.eq("jobId", jobId)).unique();
}

/** What drafting needs about the job beyond the job itself: the form already read, if any. */
export const formForAction = internalQuery({
  args: { userId: v.id("users"), jobId: v.id("jobs") },
  handler: async (ctx, { userId, jobId }) => {
    await ownJob(ctx, userId, jobId);
    return (await detailsOf(ctx, jobId))?.applyForm ?? null;
  },
});

export const save = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), form: applyFormV },
  handler: async (ctx, { userId, jobId, form }) => {
    await ownJob(ctx, userId, jobId);
    const d = await detailsOf(ctx, jobId);
    if (d) await ctx.db.patch("jobDetails", d._id, { applyForm: form });
    else await ctx.db.insert("jobDetails", { jobId, userId, applyForm: form });
    return null;
  },
});

/** The candidate's own answer to one question; filling it in clears the "needs you" flag. */
export const edit = mutation({
  args: { jobId: v.id("jobs"), index: v.number(), answer: v.string() },
  handler: async (ctx, { jobId, index, answer }) => {
    const userId = await requireUserId(ctx);
    await ownJob(ctx, userId, jobId);
    const d = await detailsOf(ctx, jobId);
    const form = d?.applyForm;
    if (!d || !form || !form.questions[index]) throw new ConvexError("Read the form's questions first.");
    const questions = form.questions.map((q, i) => (i === index ? { ...q, answer: answer.slice(0, 4000), needsYou: !answer.trim() } : q));
    await ctx.db.patch("jobDetails", d._id, { applyForm: { ...form, questions } });
    return null;
  },
});

/**
 * Everything the autofill bookmark needs for one job: this form's answers first (matched to the
 * form's exact labels), then the saved standard answers, the CV to attach and the cover letter.
 */
export const forFill = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const job = await ctx.db.get("jobs", jobId);
    if (!job || job.userId !== userId) return null;
    const d = await detailsOf(ctx, jobId);
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const pack = d?.pack ?? job.pack;
    let resume = pack?.letterOnly ? undefined : pack?.resume;
    let tailored = !!resume;
    if (!resume) {
      const resumes = await ctx.db.query("resumes").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20);
      resume = (resumes.find((r) => r._id === profile?.defaultResumeId) ?? resumes[0])?.resume;
      tailored = false;
    }
    const exact = (d?.applyForm?.questions ?? []).filter((q) => q.answer.trim()).map((q) => ({ question: q.question, answer: q.answer, exact: true }));
    const saved = (profile?.answers ?? []).filter((a) => a.question.trim() && a.answer.trim()).map((a) => ({ question: a.question, answer: a.answer, exact: false }));
    return {
      company: job.company,
      title: job.title,
      link: job.sourceUrl || job.url || "",
      resume: resume ?? null,
      tailored,
      coverLetter: pack?.coverLetter ?? "",
      answers: [...exact, ...saved],
      needsYou: (d?.applyForm?.questions ?? []).filter((q) => q.needsYou).length,
    };
  },
});
