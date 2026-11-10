// Each morning after the search: an email to every member with their best new roles, under their own role groups.
// Goes at most once a day, skips days with nothing new, and stops for anyone who asked (access.alertsOff).
import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { contactsLoadedAt } from "./contacts";
import { FRESH_PER_DAY } from "./lib/defaults";
import { alertsEmail, emailOn, sendEmail, weeklyEmail } from "./lib/email";
import { rateLimiter } from "./limits";
import { trackForTitle } from "./lib/salesRoles";
import { isOwnerEmail } from "./lib/auth";

const DAY = 86_400_000;
const PER_EMAIL = 8;
/** Below this AI score the app says skip the job, so it stays out of the email. Roles not scored yet still go in. */
const RELEVANT = 60;

const jobV = v.object({ title: v.string(), company: v.string(), where: v.string(), fit: v.optional(v.number()), id: v.string() });
const personV = v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()), groups: v.array(v.object({ track: v.string(), jobs: v.array(jobV) })) });

type Person = Infer<typeof personV>;

/** The AI's best score for a role, if it has been scored. Only about 24 a day are, so most new roles have none yet. */
function aiFit(j: { scores?: { score: number }[] }) {
  return j.scores?.length ? Math.max(...j.scores.map((s) => s.score)) : undefined;
}

/** Who could get the email today. Each person's jobs are read separately: one busy morning is too much for a single read. */
export const candidates = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.id("access")),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    // Once a day at most.
    return rows.filter((r) => r.email && !r.alertsOff && !r.rejected && !(r.alertsAt && now - r.alertsAt < 20 * 3_600_000)).map((r) => r._id);
  },
});

/** One person's new roles since the last email (or the last day), AI-scored first, grouped by their own tracks. Null with nothing to send. */
export const dueFor = internalQuery({
  args: { accessId: v.id("access"), now: v.number() },
  returns: v.union(personV, v.null()),
  handler: async (ctx, { accessId, now }) => {
    const row = await ctx.db.get("access", accessId);
    if (!row) return null;
    const since = Math.max(row.alertsAt ?? 0, now - DAY);
    const tracks = (await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", row.userId)).take(50)).filter((t) => t.status === "active");
    if (!tracks.length) return null;
    const fresh = [];
    // Newest first; stop at the first one older than the window.
    for await (const j of ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", row.userId)).order("desc")) {
      if (j._creationTime < since) break;
      if (j.status === "new") fresh.push(j);
    }
    // Every new role whose title fits one of their groups, unless the AI scored it as one to skip.
    // Scored roles first, then by the free first guess. The guess only sorts: at most 55, it would look like a poor fit.
    const best = fresh
      .map((j) => ({ j, fit: aiFit(j), guess: j.quickFit ?? 0, key: j.trackKey ?? trackForTitle(tracks, j.title) }))
      .filter((x) => (x.fit === undefined || x.fit >= RELEVANT) && tracks.some((t) => t.key === x.key))
      .sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1) || b.guess - a.guess)
      .slice(0, PER_EMAIL);
    if (!best.length) return null;
    const byTrack = new Map<string, { title: string; company: string; where: string; fit?: number; id: string }[]>();
    for (const { j, fit, key } of best) {
      const name = tracks.find((t) => t.key === key)!.name;
      const list = byTrack.get(name) ?? [];
      list.push({ title: j.title, company: j.company, where: j.location || "Not listed", fit, id: j._id });
      byTrack.set(name, list);
    }
    return { accessId: row._id, email: row.email, name: row.name, groups: [...byTrack].map(([track, jobs]) => ({ track, jobs })) };
  },
});

/** Everyone with something to send today. */
export const due = internalAction({
  args: { now: v.number() },
  returns: v.array(personV),
  handler: async (ctx, { now }): Promise<Person[]> => {
    const ids = await ctx.runQuery(internal.alerts.candidates, { now });
    const out: Person[] = [];
    let failed = 0;
    let lastError = "";
    for (const accessId of ids) {
      // One person's list failing to build must not stop everyone else's email.
      try {
        const p: Person | null = await ctx.runQuery(internal.alerts.dueFor, { accessId, now });
        if (p) out.push(p);
      } catch (err) {
        failed++;
        lastError = String(err);
        console.warn("New-roles list failed for", accessId, lastError);
      }
    }
    if (failed) await ctx.runMutation(internal.errors.logServer, { message: `New-roles list couldn't be built for ${failed} people. Last reason: ${lastError}`, page: "new roles email" });
    return out;
  },
});

const weekV = v.object({ email: v.string(), name: v.optional(v.string()), found: v.number(), strong: v.number(), tailored: v.number(), applied: v.number(), refreshConnections: v.boolean() });

/** One person's week, for the Monday email. Null for anyone who isn't set up or had no new jobs. */
export const weekFor = internalQuery({
  args: { accessId: v.id("access"), now: v.number() },
  returns: v.union(weekV, v.null()),
  handler: async (ctx, { accessId, now }) => {
    const row = await ctx.db.get("access", accessId);
    if (!row?.email || row.alertsOff || row.rejected) return null;
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
    if (!profile?.onboarded) return null;
    let found = 0;
    let strong = 0;
    for await (const j of ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", row.userId)).order("desc")) {
      if (j._creationTime < now - 7 * DAY || found >= 1000) break;
      found++;
      if ((aiFit(j) ?? 0) >= 75) strong++;
    }
    if (!found) return null;
    const totals = await ctx.db.query("usageTotals").withIndex("by_userId", (q) => q.eq("userId", row.userId)).first();
    const loaded = await contactsLoadedAt(ctx, row.userId, profile);
    return { email: row.email, name: row.name, found, strong, tailored: totals?.tailored ?? 0, applied: totals?.applied ?? 0, refreshConnections: !loaded || now - loaded > 30 * DAY };
  },
});

/** Mondays: what JobPipe did for each person this week, and the one thing to do next. */
export const sendWeekly = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { dryRun }): Promise<string> => {
    if (!emailOn()) return "Email is off.";
    const now = Date.now();
    const ids = await ctx.runQuery(internal.alerts.candidates, { now: now + DAY });
    let sent = 0;
    for (const accessId of ids) {
      const week = await ctx.runQuery(internal.alerts.weekFor, { accessId, now });
      if (!week || dryRun) continue;
      try {
        await sendEmail({ to: week.email, ...weeklyEmail(week) });
        sent++;
      } catch (err) {
        console.warn("Weekly email failed for", week.email, String(err));
      }
    }
    return `Sent ${sent}.`;
  },
});

export const markSent = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.null(),
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { alertsAt: Date.now() });
    return null;
  },
});

/** Turns the email off for one person, for when they reply "stop". Run by the owner: `npx convex run alerts:turnOff '{"email":"..."}' --prod`. */
export const turnOff = internalMutation({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const row = rows.find((r) => r.email.toLowerCase() === email.trim().toLowerCase());
    if (!row) return false;
    await ctx.db.patch("access", row._id, { alertsOff: true });
    return true;
  },
});

/**
 * Takes one of today's fresh alerts for this person, within their limit and the app's. Returns where to send it,
 * or null to stay quiet. Taken before sending, so a retry can't send the same alert twice.
 */
export const claimFresh = internalMutation({
  args: { userId: v.id("users"), day: v.string() },
  handler: async (ctx, { userId, day }) => {
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (!row?.email || row.alertsOff || row.rejected) return null;
    const count = row.freshDay === day ? (row.freshCount ?? 0) : 0;
    if (count >= FRESH_PER_DAY) return null;
    if (!(await rateLimiter.limit(ctx, "freshAlert")).ok) return null;
    await ctx.db.patch("access", row._id, { freshDay: day, freshCount: count + 1 });
    return { email: row.email, name: row.name };
  },
});

export const send = internalAction({
  // dryRun: returns who would get what, without sending.
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { dryRun }): Promise<string> => {
    if (!emailOn()) return "Email is off.";
    const people: Person[] = await ctx.runAction(internal.alerts.due, { now: Date.now() });
    if (dryRun) return people.map((p) => `${p.email}: ${p.groups.map((g) => `${g.track} (${g.jobs.length})`).join(", ")}`).join("\n") || "Nobody due.";
    let sent = 0;
    let lastError = "";
    for (const p of people) {
      try {
        await sendEmail({ to: p.email, ...alertsEmail(p) });
        await ctx.runMutation(internal.alerts.markSent, { accessId: p.accessId });
        sent++;
      } catch (err) {
        // One bad address doesn't stop the rest.
        console.warn("New-roles email failed for", p.email, String(err));
        lastError = String(err);
      }
    }
    if (sent < people.length) await ctx.runMutation(internal.errors.logServer, { message: `New-roles email failed for ${people.length - sent} of ${people.length} people. Last reason: ${lastError}`, page: "new roles email" });
    return `Sent ${sent} of ${people.length}.`;
  },
});

/**
 * For the owner: did each member get a new-jobs email in the last day, and if not, why not.
 * npx convex run --prod alerts:report
 */
export const report = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const day = (at?: number) => (at ? new Date(at + 19_800_000).toISOString().slice(0, 16).replace("T", " ") : "never");
    const rows = (await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(300)).filter((r) => !isOwnerEmail(r.email));
    const out = [];
    for (const r of rows) {
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", r.userId)).unique();
      const tracks = (await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", r.userId)).take(50)).filter((t) => t.status === "active");
      let newJobs = 0;
      for await (const j of ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", r.userId)).order("desc")) {
        if (j._creationTime < now - DAY || newJobs >= 500) break;
        newJobs++;
      }
      const run = profile?.lastAutopilot;
      const gotDaily = !!r.alertsAt && now - r.alertsAt < DAY;
      const gotFresh = r.freshDay === new Date(now + 19_800_000).toISOString().slice(0, 10) && (r.freshCount ?? 0) > 0;
      // Only the daily email counts here: same-day alerts for strong matches are extra.
    const why = gotDaily ? "" : r.alertsOff ? "asked to stop emails" : !profile?.onboarded ? "hasn't finished setup" : !tracks.length ? "no roles picked" : !profile.autopilot ? "morning search is off" : !run || now - run.at > DAY ? "morning search hasn't run for them yet (joined after it, or it missed them)" : newJobs === 0 ? "search found no new jobs" : "new jobs found, but none fit their roles";
      out.push({
        email: r.email,
        partner: r.partner?.name ?? "",
        roles: tracks.map((t) => t.name).join(", "),
        lastSearch: day(run?.at),
        jobsAddedLastSearch: run?.added ?? 0,
        newJobsLast24h: newJobs,
        dailyEmail: day(r.alertsAt),
        alertsToday: gotFresh ? (r.freshCount ?? 0) : 0,
        searchProblems: run?.failed?.join(", ") ?? "",
        whyNoEmail: why,
      });
    }
    out.sort((a, b) => (a.whyNoEmail ? 0 : 1) - (b.whyNoEmail ? 0 : 1));
    const got = out.filter((p) => !p.whyNoEmail).length;
    return { summary: `${got} of ${out.length} members got the daily new-jobs email in the last day`, people: out };
  },
});

/**
 * For the owner: one member's search settings, to see why they get few or no jobs.
 * npx convex run --prod alerts:searchSetup '{"email":"x@y.com"}'
 */
export const searchSetup = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email.trim())).first();
    if (!user) return "No account with that email.";
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", user._id)).unique();
    const tracks = await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", user._id)).take(50);
    const jobs = await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", user._id)).order("desc").take(2000);
    const day = (at?: number) => (at ? new Date(at + 19_800_000).toISOString().slice(0, 16).replace("T", " ") : "never");
    return {
      location: profile?.location ?? "",
      markets: profile?.markets ?? "",
      autopilot: profile?.autopilot ?? false,
      hasCv: !!profile?.defaultResumeId,
      lastRun: profile?.lastAutopilot ? { ...profile.lastAutopilot, at: day(profile.lastAutopilot.at) } : null,
      roles: tracks.map((t) => ({ name: t.name, status: t.status, titles: t.titles.join(", ") })),
      jobsEver: jobs.length,
      newestJob: jobs[0] ? `${day(jobs[0]._creationTime)} · ${jobs[0].title} at ${jobs[0].company} (${jobs[0].location})` : "none",
    };
  },
});
