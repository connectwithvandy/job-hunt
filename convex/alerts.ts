// Each morning after the search: an email to every member with their best new roles, under their own role groups.
// Goes at most once a day, skips days with nothing new, and stops for anyone who asked (access.alertsOff).
import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { contactsLoadedAt } from "./contacts";
import { alertsEmail, emailOn, sendEmail, weeklyEmail } from "./lib/email";
import { trackForTitle } from "./lib/salesRoles";

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
    for (const accessId of ids) {
      const p: Person | null = await ctx.runQuery(internal.alerts.dueFor, { accessId, now });
      if (p) out.push(p);
    }
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
