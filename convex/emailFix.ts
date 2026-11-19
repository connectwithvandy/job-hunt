// One-off clean-up: emails saved on a job before the role check existed (19 Nov 2026).
// An email that names a role ("joining ElevenLabs as a Sales Development Lead - North America") but sits on a job
// with another title ("SMB Lead - APAC") moves to the company's job with that title, or comes off the job when
// there is none. The email stays in Gmail either way. Safe to run twice: a second run finds nothing to change.
//
// Dry run first:  npx convex run --prod emailFix:rematchEmails '{"userId":"<id>","dryRun":true}'
// Then for real:  npx convex run --prod emailFix:rematchEmails '{"userId":"<id>","dryRun":false}'

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { companyKey } from "./lib/company";
import { roleNamed, titleFit } from "./lib/inbox";
import { meetingEnd } from "./lib/meeting";

const FITS = 0.6;
// How much better another job's title must fit before an email moves there.
const BETTER_BY = 0.3;

export const rematchEmails = internalMutation({
  args: { userId: v.id("users"), dryRun: v.boolean() },
  returns: v.array(
    v.object({
      emailId: v.id("jobEmails"),
      subject: v.string(),
      role: v.string(),
      fromJob: v.string(),
      toJob: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { userId, dryRun }) => {
    // Newest first: an account can hold more than 1,000 jobs, and taking the oldest 1,000 missed the ones with
    // recent emails (19 Nov: the first run found nothing).
    const recent = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(1000);
    // Jobs in motion count however old they are: the Sr Manager job sat past the newest 1,000, so its email had nowhere to go.
    const moving = [];
    for (const status of ["applying", "applied", "screening", "interview", "offer"] as const) {
      moving.push(...(await ctx.db.query("jobs").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status)).take(200)));
    }
    const seen = new Set(recent.map((j) => j._id));
    const jobs = [...recent, ...moving.filter((j) => !seen.has(j._id))];
    const changes: { emailId: Id<"jobEmails">; subject: string; role: string; fromJob: string; toJob: string | null }[] = [];
    const touched = new Set<Id<"jobs">>();

    // Every saved email also sets the job's lastEmail, so jobs without one have no emails to check.
    for (const job of jobs.filter((j) => j.lastEmail)) {
      const emails = await ctx.db.query("jobEmails").withIndex("by_jobId_and_at", (q) => q.eq("jobId", job._id)).take(200);
      for (const e of emails) {
        const role = roleNamed(`${e.subject}\n${e.snippet.slice(0, 800)}`);
        if (!role) continue;
        const here = titleFit(job.title, role);
        const key = companyKey(job.company);
        const target = jobs
          .filter((j) => j._id !== job._id && companyKey(j.company) === key)
          .map((j) => ({ j, fit: titleFit(j.title, role) }))
          .filter((x) => x.fit >= FITS)
          .sort((a, b) => b.fit - a.fit)[0]?.j;
        // Move it when it doesn't fit here, or when another of the company's jobs fits clearly better.
        const better = target && titleFit(target.title, role) >= here + BETTER_BY;
        // Only move to a job that clearly fits better. With no such job the email stays put: deleting it would lose
        // a real email when the role's wording just differs (Trail "GTM Builder" vs "Enterprise GTM Manager").
        if (!target || (here >= FITS && !better)) continue;
        changes.push({ emailId: e._id, subject: e.subject, role, fromJob: `${job.company} · ${job.title}`, toJob: target ? `${target.company} · ${target.title}` : null });
        if (dryRun) continue;
        await ctx.db.patch("jobEmails", e._id, { jobId: target._id });
        touched.add(target._id);
        touched.add(job._id);
      }
    }

    // Each changed job's "last email" becomes its newest remaining one. Status is left as it is.
    for (const jobId of touched) {
      const newest = await ctx.db.query("jobEmails").withIndex("by_jobId_and_at", (q) => q.eq("jobId", jobId)).order("desc").first();
      await ctx.db.patch("jobs", jobId, { lastEmail: newest ? lastEmailOf(newest) : undefined });
    }
    return changes;
  },
});

function lastEmailOf(e: Doc<"jobEmails">): NonNullable<Doc<"jobs">["lastEmail"]> {
  return { subject: e.subject, from: e.from, at: e.at, stage: e.stage, ...(e.repliedAt ? { repliedAt: e.repliedAt } : {}) };
}

/**
 * One-off: save the meeting time on jobs whose interview invite arrived before this was kept (19 Nov), so an
 * interview that already happened stops asking to be answered. Only jobs whose latest email is an interview.
 * npx convex run --prod emailFix:backfillMeetings '{"dryRun":true}'
 */
export const backfillMeetings = internalMutation({
  args: { dryRun: v.boolean(), userId: v.optional(v.id("users")) },
  returns: v.array(v.object({ company: v.string(), title: v.string(), meetingEndAt: v.number() })),
  handler: async (ctx, { dryRun, userId }) => {
    const out: { company: string; title: string; meetingEndAt: number }[] = [];
    // One person at a time when given, so a big account can't push the run past the read limit.
    const users = userId ? [{ _id: userId }] : await ctx.db.query("users").take(1000);
    for (const u of users) {
      // Only jobs in motion can hold an interview invite; reading every job ran past the read limit.
      const jobs = [];
      for (const status of ["applied", "screening", "interview"] as const) {
        jobs.push(...(await ctx.db.query("jobs").withIndex("by_userId_and_status", (q) => q.eq("userId", u._id).eq("status", status)).take(100)));
      }
      for (const j of jobs) {
        if (j.lastEmail?.stage !== "interview" || j.meetingEndAt) continue;
        const emails = await ctx.db.query("jobEmails").withIndex("by_jobId_and_at", (q) => q.eq("jobId", j._id)).order("desc").take(20);
        const end = emails.map((e) => meetingEnd(e.subject)).find((t): t is number => t !== null);
        if (!end) continue;
        out.push({ company: j.company, title: j.title, meetingEndAt: end });
        if (!dryRun) await ctx.db.patch("jobs", j._id, { meetingEndAt: end });
      }
    }
    return out;
  },
});
