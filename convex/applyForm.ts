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
    let form;
    try {
      form = await readFormQuestions(boardFromUrl(link), link);
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
    const filled = questions.map((q, i) => settle(q, result.answers[i]));
    await ctx.runMutation(internal.applyAnswers.save, { userId, jobId, form: { at: Date.now(), source: form.source, questions: filled } });
    return { questions: filled.length, needsYou: filled.filter((q) => q.needsYou).length };
  },
});

/** Keeps only answers that can go into the form as they are: a listed option, nothing on legal or personal questions. */
function settle(q: FormQuestion, a: { answer: string; needsYou: boolean } | undefined) {
  let answer = (a?.answer ?? "").trim();
  if (mustAnswerYourself(q.question)) answer = "";
  if (answer && q.options) answer = q.options.find((o) => o.toLowerCase() === answer.toLowerCase()) ?? "";
  return { question: q.question, answer, options: q.options, required: q.required, long: q.long, needsYou: !answer || !!a?.needsYou };
}
