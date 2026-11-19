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

/** One pasted question and its drafted answer, added to the job's form answers (the same question is replaced). */
export const addPasted = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), question: v.string(), answer: v.string(), needsYou: v.boolean(), long: v.boolean() },
  handler: async (ctx, { userId, jobId, question, answer, needsYou, long }) => {
    await ownJob(ctx, userId, jobId);
    const d = await detailsOf(ctx, jobId);
    const form = d?.applyForm ?? { at: Date.now(), source: "pasted" as const, questions: [] };
    const row = { question, answer: answer.slice(0, 4000), required: false, long, needsYou, pasted: true };
    const questions = [...form.questions.filter((q) => q.question !== question), row].slice(-60);
    if (d) await ctx.db.patch("jobDetails", d._id, { applyForm: { ...form, questions } });
    else await ctx.db.insert("jobDetails", { jobId, userId, applyForm: { ...form, questions } });
    return null;
  },
});

/** One interview question and its drafted answer, kept with the job (the same question is replaced). */
export const addInterview = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), question: v.string(), answer: v.string() },
  handler: async (ctx, { userId, jobId, question, answer }) => {
    await ownJob(ctx, userId, jobId);
    const d = await detailsOf(ctx, jobId);
    const row = { question, answer: answer.slice(0, 4000), at: Date.now() };
    const interviewAnswers = [...(d?.interviewAnswers ?? []).filter((q) => q.question !== question), row].slice(-30);
    if (d) await ctx.db.patch("jobDetails", d._id, { interviewAnswers });
    else await ctx.db.insert("jobDetails", { jobId, userId, interviewAnswers });
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
    // Blank ones too: a question the candidate must answer must not be filled by a looser match (like their own email).
    const exact = (d?.applyForm?.questions ?? []).map((q) => ({ question: q.question, answer: q.answer.trim(), exact: true }));
    const saved = (profile?.answers ?? []).filter((a) => a.question.trim() && a.answer.trim()).map((a) => ({ question: a.question, answer: a.answer, exact: false }));
    // Name, email, phone and the rest straight from the CV, for anything not saved as an answer: with no saved
    // answers the form got nothing to fill (19 Nov test on an Ashby form). Saved answers still win.
    const have = new Set(saved.map((a) => a.question.trim().toLowerCase()));
    const now = resume?.experience[0];
    const school = resume?.education[0];
    const fromCv = resume
      ? [
          ["Full name", resume.name],
          ["Email", resume.contact.email],
          ["Phone", resume.contact.phone],
          ["LinkedIn profile", resume.contact.linkedin],
          ["Current location", resume.contact.location],
          ["Current company", now?.company ?? ""],
          ["Current job title", now?.role ?? ""],
          ["University", school?.school ?? ""],
          ["Highest degree", school?.degree ?? ""],
        ]
          .filter(([q, a]) => a.trim() && !have.has(q.toLowerCase()))
          .map(([question, answer]) => ({ question, answer: answer.trim(), exact: false }))
      : [];
    return {
      company: job.company,
      title: job.title,
      link: job.sourceUrl || job.url || "",
      resume: resume ?? null,
      tailored,
      coverLetter: pack?.coverLetter ?? "",
      answers: [...exact, ...saved, ...fromCv],
      needsYou: (d?.applyForm?.questions ?? []).filter((q) => q.needsYou).length,
    };
  },
});
