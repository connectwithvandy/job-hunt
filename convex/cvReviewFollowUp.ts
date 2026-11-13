"use node";

// Two days after a free CV review (/cv-review), one email to people who haven't joined: their score, five open
// roles for the role they picked, and a link to start free. 13 Nov: 11 of 14 reviewers never joined and heard
// nothing more. Each person gets it once (cvReviews.followedUpAt).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { cvFollowUpEmail, emailOn, sendEmail } from "./lib/email";
import { matchRoles, openNow, type Role } from "./subscriberSend";
import { cleanCompany, companyKey } from "./lib/company";
import { isTechCompany } from "./growth";

/** The review page's role choices, as job titles to search. */
const TITLES: Record<string, string[]> = {
  "SDR / BDR": ["Sales Development Representative", "Business Development Representative"],
  "SDR / BDR leadership": ["Sales Development Manager", "SDR Manager", "Head of Sales Development", "Inside Sales Manager"],
  "Account Executive": ["Account Executive"],
  "Sales leadership": ["Head of Sales", "Sales Director"],
  "Customer Success / Account Management": ["Customer Success Manager", "Account Manager"],
};
const JOBS = 5;
// At most this many a day, well inside the email service's free allowance.
const PER_RUN = 20;

// Not a fit for this email: internships, roles for another country's market, and agencies or job boards (13 Nov dry run).
const NOT_FOR_THEM = /\b(intern|interns|internship|trainee|fresher|amer|americas|north america|latam|emea|apac|anz|uk|us|usa|south africa|mena|dach|nordics)\b/i;
const NOT_EMPLOYER = /\b(consult\w*|staffing|recruit\w*|placements?|manpower|hr solutions|jobs?)\b/i;

/**
 * The best few open roles for these titles: one per company, tech and startup companies first (the readers are
 * after SaaS sales roles), nothing junior, abroad or from an agency.
 */
function pick(titles: string[], roles: Role[]) {
  const clean = roles
    // Titles can carry "&amp;" from the boards; the email shows plain "&".
    .map((r) => ({ ...r, title: r.title.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(), company: cleanCompany(r.company).replace(/^us\s*:\s*/i, "") || r.company }))
    .filter((r) => !NOT_FOR_THEM.test(r.title) && !NOT_EMPLOYER.test(r.company));
  // Tech companies first, then the rest, each in the search's order.
  const ordered = [...clean.filter((r) => isTechCompany(r.company, r.title, r.url)), ...clean.filter((r) => !isTechCompany(r.company, r.title, r.url))];
  const perCompany = new Set<string>();
  const once = ordered.filter((r) => {
    const k = companyKey(r.company);
    if (perCompany.has(k)) return false;
    perCompany.add(k);
    return true;
  });
  return matchRoles({ titles, location: "India" }, once)
    .flatMap((g) => g.jobs)
    .slice(0, JOBS);
}

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
      // An SDR pick must be about sales development: plain "Business Development Manager" roles filled the list (13 Nov).
      const sdr = /SDR/.test(r.role);
      const jobs = pick(titles, (await openNow(ctx, titles, "India")).filter((j) => !sdr || /sales development|\bsdr\b|\bbdr\b|inside sales|lead generation/i.test(j.title)));
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
