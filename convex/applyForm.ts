"use node";

// Reads a job's application form and drafts an answer to each question from the candidate's CV,
// saved answers and facts. Nothing is sent to the employer: the candidate checks the answers on the
// job page, then the autofill bookmark fills them into the form and they press Submit themselves.
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { askJSON } from "./lib/ai";
import { requireUserId } from "./lib/auth";
import { boardFromUrl } from "./lib/boardFromUrl";
import { mustAnswerYourself, readFormQuestions, type FormQuestion } from "./lib/formQuestions";

const drafted = z.object({
  answers: z.array(z.object({ answer: z.string(), needsYou: z.boolean() })),
});

const SYSTEM = `You fill in job application forms for a candidate, who checks every answer before submitting.
Rules:
- Use only what the CV, the saved answers and the facts say. Never invent numbers, dates, salaries, notice periods, visa or work-permit status, degrees, or employers.
- When the answer isn't there, return an empty answer and needsYou true. A blank the candidate fills is far better than a guess.
- When options are listed, the answer must be exactly one of the options, copied character for character.
- Short questions get short answers (a number, a city, yes or no). Long questions ("why us", "tell us about") get 60 to 120 words, first person, plain and specific, built from real CV achievements and the job's needs. No buzzwords, no "I am excited to".
- Legal agreements, consent, policies, and demographic or personal questions (gender, race, disability, veteran status): empty answer, needsYou true.
- Return exactly one answer per question, in the same order.`;

export const readForm = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<{ questions: number; needsYou: number }> => {
    const userId = await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">;
    const link = job.sourceUrl || job.url || "";
    // A careers-board job keeps its board and id in externalId ("careers:ashby:cursor:<id>"), which still works
    // when the link points at the company's own site instead.
    const ext = job.externalId.match(/^careers:(ashby|greenhouse|lever):([^:]+):(.+)$/);
    const board = boardFromUrl(link) ?? (ext ? { ats: ext[1], slug: ext[2] } : null);
    const formLink = boardFromUrl(link) || !ext ? link : formLinkFor(ext[1], ext[2], ext[3]);
    let form;
    try {
      form = await readFormQuestions(board, formLink);
    } catch {
      throw new ConvexError("Couldn't reach the application form just now. Try again in a minute.");
    }
    if (!form) {
      throw new ConvexError("This form isn't on Greenhouse, Lever or Ashby, so JobPipe can't read its questions. Your Autofill bookmark still fills your standard answers there.");
    }
    if (!form.questions.length) {
      await ctx.runMutation(internal.applyAnswers.save, { userId, jobId, form: { at: Date.now(), source: form.source, questions: [] } });
      return { questions: 0, needsYou: 0 };
    }
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1, checkOnly: true });
    const me = await ctx.runQuery(internal.users.context, { userId });
    const pack = job.pack;
    const cv = pack && !pack.letterOnly ? pack.resume : me.resume;
    if (!cv) throw new ConvexError("Upload your CV first.");
    const questions = form.questions.slice(0, 40);
    const result = await askJSON({
      system: SYSTEM,
      tier: "standard",
      shared: `CV:\n${JSON.stringify(cv)}`,
      prompt: [
        `Job: ${job.title} at ${job.company}.`,
        job.description ? `Job description:\n${job.description.slice(0, 6000)}` : "",
        me.answers.length ? `Saved answers:\n${me.answers.map((a: { question: string; answer: string }) => `- ${a.question}: ${a.answer}`).join("\n")}` : "",
        me.facts.length ? `Facts the candidate gave beyond the CV:\n${me.facts.map((f: { question: string; answer: string }) => `- ${f.question}: ${f.answer}`).join("\n")}` : "",
        `Questions:\n${questions.map((q, i) => `${i + 1}. ${q.question}${q.required ? " (required)" : ""}${q.long ? " (long answer)" : ""}${q.options ? ` Options: ${q.options.map((o) => `"${o}"`).join(", ")}` : ""}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: drafted,
    });
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1 });
    // Questions the candidate pasted by hand stay, after the form's own.
    const old = await ctx.runQuery(internal.applyAnswers.formForAction, { userId, jobId });
    const read = questions.map((q, i) => settle(q, result.answers[i]));
    const filled = [...read, ...(old?.questions ?? []).filter((q) => q.pasted && !read.some((r) => r.question === q.question))];
    await ctx.runMutation(internal.applyAnswers.save, { userId, jobId, form: { at: Date.now(), source: form.source, questions: filled } });
    return { questions: filled.length, needsYou: filled.filter((q) => q.needsYou).length };
  },
});

const PASTED = `You answer one question from a job application form for a candidate, who checks it before submitting.
Rules:
- Use only what the CV, the saved answers, the facts, the job and the company notes say. Never invent numbers, dates, salaries, notice periods, visa or work-permit status, degrees, employers or reasons.
- When the answer depends on something not given (salary, notice period, visa, a personal reason), return an empty answer and needsYou true.
- "Why us" or "why this role": tie 2 real CV achievements to what this job and company need. Name the company. First person, plain and specific. No buzzwords, no "I am excited to", no "passionate".
- Keep to the word limit given. Short questions get short answers.`;

/**
 * Drafts an answer to one question the candidate pasted from any application form (Workday, a company's own site),
 * and keeps it with the job's form answers so the autofill bookmark can use it too.
 */
export const answerQuestion = action({
  args: { jobId: v.id("jobs"), question: v.string(), words: v.optional(v.number()) },
  handler: async (ctx, { jobId, question, words }): Promise<{ answer: string; needsYou: boolean }> => {
    const userId = await requireUserId(ctx);
    const q = question.trim().slice(0, 600);
    if (q.length < 5) throw new ConvexError("Paste the question from the form.");
    const limit = Math.min(Math.max(Math.round(words ?? 120), 20), 300);
    const job = (await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">;
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1, checkOnly: true });
    const me = await ctx.runQuery(internal.users.context, { userId });
    const pack = job.pack;
    const cv = pack && !pack.letterOnly ? pack.resume : me.resume;
    if (!cv) throw new ConvexError("Upload your CV first.");
    const r = job.research;
    const result = await askJSON({
      system: PASTED,
      tier: "standard",
      shared: `CV:\n${JSON.stringify(cv)}`,
      prompt: [
        `Job: ${job.title} at ${job.company}.`,
        job.description ? `Job description:\n${job.description.slice(0, 6000)}` : "",
        r ? `About ${job.company}: ${r.summary} ${r.hiringSignals}`.slice(0, 1500) : "",
        me.answers.length ? `Saved answers:\n${me.answers.map((a: { question: string; answer: string }) => `- ${a.question}: ${a.answer}`).join("\n")}` : "",
        me.facts.length ? `Facts the candidate gave beyond the CV:\n${me.facts.map((f: { question: string; answer: string }) => `- ${f.question}: ${f.answer}`).join("\n")}` : "",
        `Word limit: ${limit}.`,
        `Question: ${q}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: z.object({ answer: z.string(), needsYou: z.boolean() }),
    });
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1 });
    const answer = mustAnswerYourself(q) ? "" : result.answer.trim();
    const needsYou = !answer || result.needsYou;
    await ctx.runMutation(internal.applyAnswers.addPasted, { userId, jobId, question: q, answer, needsYou, long: limit > 40 });
    return { answer, needsYou };
  },
});

const INTERVIEW = `You help a sales candidate answer one interview question out loud, for a specific job.
Rules:
- Use only what the CV, the saved facts, the job and the company notes say. Never invent numbers, deals, clients, team sizes, titles or outcomes. If the CV has no example that fits, say so in one line and suggest which real experience to use instead.
- Behaviour questions ("tell me about a time…"): a STAR answer, Situation, Task, Action, Result, with the real numbers from the CV, then one line on what it means for this job.
- Other questions ("why us", "walk me through your CV", "your biggest weakness"): a direct spoken answer that ties real experience to this job and company.
- 120 to 220 words, first person, how a person speaks: short sentences, no buzzwords, no "I am passionate".
- Keep claims exactly as big as the CV makes them: "helped set up" stays "helped set up".`;

/** Drafts a spoken answer to one interview question the candidate types in, and keeps it with the job. */
export const answerInterview = action({
  args: { jobId: v.id("jobs"), question: v.string() },
  handler: async (ctx, { jobId, question }): Promise<{ answer: string }> => {
    const userId = await requireUserId(ctx);
    const q = question.trim().slice(0, 600);
    if (q.length < 5) throw new ConvexError("Type the interview question.");
    const job = (await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">;
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1, checkOnly: true });
    const me = await ctx.runQuery(internal.users.context, { userId });
    const pack = job.pack;
    const cv = pack && !pack.letterOnly ? pack.resume : me.resume;
    if (!cv) throw new ConvexError("Upload your CV first.");
    const r = job.research;
    const result = await askJSON({
      system: INTERVIEW,
      tier: "standard",
      shared: `CV:\n${JSON.stringify(cv)}`,
      prompt: [
        `Job: ${job.title} at ${job.company}.`,
        job.description ? `Job description:\n${job.description.slice(0, 6000)}` : "",
        r ? `About ${job.company}: ${r.summary} ${r.hiringSignals}`.slice(0, 1500) : "",
        me.facts.length ? `Facts the candidate gave beyond the CV:\n${me.facts.map((f: { question: string; answer: string }) => `- ${f.question}: ${f.answer}`).join("\n")}` : "",
        `Interview question: ${q}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: z.object({ answer: z.string() }),
    });
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1 });
    const answer = result.answer.trim();
    await ctx.runMutation(internal.applyAnswers.addInterview, { userId, jobId, question: q, answer });
    return { answer };
  },
});

/** The board's own address for a job, so its id can be read the usual way. */
function formLinkFor(ats: string, slug: string, id: string) {
  if (ats === "greenhouse") return `https://job-boards.greenhouse.io/${slug}/jobs/${id}`;
  if (ats === "lever") return `https://jobs.lever.co/${slug}/${id}`;
  return `https://jobs.ashbyhq.com/${slug}/${id}`;
}

/** Keeps only answers that can go into the form as they are: a listed option, nothing on legal or personal questions. */
function settle(q: FormQuestion, a: { answer: string; needsYou: boolean } | undefined) {
  let answer = (a?.answer ?? "").trim();
  if (mustAnswerYourself(q.question)) answer = "";
  if (answer && q.options) answer = q.options.find((o) => o.toLowerCase() === answer.toLowerCase()) ?? "";
  return { question: q.question, answer, options: q.options, required: q.required, long: q.long, needsYou: !answer || !!a?.needsYou };
}
