"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { fileText } from "./agent";
import { askJSON } from "./lib/ai";
import { REVIEW_ROLES, REVIEW_SYSTEM, ReviewSchema, type Review } from "./lib/cvReview";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The free CV review on /cv-review: no account needed, one per email. The file is read here and thrown away;
 * only the email, role and review are kept.
 */
export const review = action({
  args: { email: v.string(), role: v.string(), fileName: v.string(), file: v.bytes() },
  handler: async (ctx, args): Promise<Review> => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new ConvexError("Type a valid email.");
    const role = REVIEW_ROLES.includes(args.role) ? args.role : "Sales";
    if (args.file.byteLength > MAX_BYTES) throw new ConvexError("That file is over 5 MB. Upload a smaller PDF.");

    const text = (await fileText(new Blob([args.file]), args.fileName)).trim();
    if (text.length < 300) throw new ConvexError("Couldn't read much text from that file. If it's a scanned image, export it from Word or Canva as a PDF.");

    await ctx.runMutation(internal.cvReviews.reserve, { email });
    const raw = await askJSON({
      system: REVIEW_SYSTEM,
      prompt: `Target role: ${role}\n\nThe CV:\n<cv>\n${text.slice(0, 20000)}\n</cv>`,
      schema: ReviewSchema,
      tier: "standard",
    });
    const review = { ...raw, score: Math.round(Math.min(100, Math.max(0, raw.score))), strengths: raw.strengths.slice(0, 3), fixes: raw.fixes.slice(0, 5), missing: raw.missing.slice(0, 8) };
    await ctx.runMutation(internal.cvReviews.save, { email, role, review });
    return review;
  },
});
