"use node";

// One-click rewrites of a single line of a tailored CV: shorter, or plainer. Runs on the cheapest model, and every
// answer is checked in code (lib/rewriteGuard.ts) so it can never add a number, a name or a bigger claim.
// The person sees the suggestion and chooses to use it; nothing is saved here.

import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { askJSON } from "./lib/ai";
import { rewriteProblem } from "./lib/rewriteGuard";

const ASK = {
  shorter: "Make this line shorter: about two-thirds of its length. Keep the most important result.",
  plain: "Rewrite this line in plain words: remove jargon and buzzwords so anyone can follow it.",
} as const;

const SYSTEM = [
  "You edit one line of a sales professional's CV.",
  "Never add anything: no new numbers, names, tools, companies, job titles, results or claims.",
  "Keep every number exactly as written. Keep words like 'helped', 'supported' or 'contributed' when the line has them.",
  "You may drop words, merge phrases and swap a word for a simpler one. Never make the claim bigger.",
  "Write in the same person and tense as the line. No full stop if the line has none.",
].join(" ");

export const rewriteLine = action({
  args: { jobId: v.id("jobs"), text: v.string(), mode: v.union(v.literal("shorter"), v.literal("plain")) },
  handler: async (ctx, { jobId, text, mode }): Promise<{ text: string } | { problem: string }> => {
    const userId = await requireUserId(ctx);
    const line = text.trim();
    if (!line) throw new ConvexError("Pick a line to rewrite first.");
    if (line.length > 1200) throw new ConvexError("That's too long to rewrite in one go. Try one bullet or the summary.");
    // Checks the job is yours.
    await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    // Check the allowance first; spend only when the AI answered, so a failure costs nothing.
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1, checkOnly: true });
    const out = await askJSON({
      system: SYSTEM,
      prompt: `${ASK[mode]}\n\nThe line:\n${line}`,
      schema: z.object({ text: z.string() }),
      tier: "cheap",
      effort: "low",
    });
    await ctx.runMutation(internal.limits.consume, { userId, kind: "notes", count: 1 });
    const rewrite = out.text.trim();
    const problem = rewriteProblem(line, rewrite);
    return problem ? { problem: `${problem} Your line is unchanged.` } : { text: rewrite };
  },
});
