"use node";

// Two days after a free CV review (/cv-review), one email to people who haven't joined: their score, five open
// roles for the role they picked, and a link to start free. 13 Nov: 11 of 14 reviewers never joined and heard
// nothing more. Each person gets it once (cvReviews.followedUpAt).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { cvFollowUpEmail, emailOn, sendEmail } from "./lib/email";
import { matchRoles, openNow } from "./subscriberSend";

/** The review page's role choices, as job titles to search. */
const TITLES: Record<string, string[]> = {
  "SDR / BDR": ["Sales Development Representative", "Business Development Representative"],
  "SDR / BDR leadership": ["Sales Development Manager", "SDR Manager"],
  "Account Executive": ["Account Executive"],
  "Sales leadership": ["Head of Sales", "Sales Director"],
  "Customer Success / Account Management": ["Customer Success Manager", "Account Manager"],
};
const JOBS = 5;
// At most this many a day, well inside the email service's free allowance.
const PER_RUN = 20;

/** Sends what's due. With dryRun, says who would get what and sends nothing. */
export const send = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { dryRun }): Promise<string> => {
    if (!dryRun && !emailOn()) return "Email is off.";
    const due: { id: Id<"cvReviews">; email: string; role: string; score: number }[] = await ctx.runQuery(internal.cvReviews.followUpsDue, { now: Date.now() });
    const lines: string[] = [];
    let sent = 0;
    for (const r of due.slice(0, PER_RUN)) {
      const titles = TITLES[r.role] ?? [r.role];
      const groups = matchRoles({ titles, location: "India" }, await openNow(ctx, titles, "India"));
      const jobs = groups.flatMap((g) => g.jobs).slice(0, JOBS);
      if (dryRun) {
        lines.push(`${r.email}: ${r.role}, scored ${r.score}, ${jobs.length} jobs (${jobs.map((j) => `${j.title} at ${j.company}`).join("; ")})`);
        continue;
      }
      try {
        await sendEmail({ to: r.email, ...cvFollowUpEmail({ role: r.role, score: r.score, jobs }) });
        await ctx.runMutation(internal.cvReviews.markFollowedUp, { id: r.id });
        sent++;
      } catch (err) {
        console.warn("CV review follow-up failed for", r.email, String(err));
      }
    }
    return dryRun ? lines.join("\n") || "Nobody due." : `Sent ${sent} of ${Math.min(due.length, PER_RUN)}.`;
  },
});
