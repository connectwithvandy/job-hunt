// Each morning after the search: an email to every member with their best new roles, under their own role groups.
// Goes at most once a day, skips days with nothing new, and stops for anyone who asked (access.alertsOff).
import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { alertsEmail, emailOn, sendEmail } from "./lib/email";
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

/** Members with new roles since the last email (or the last day), best fit first, grouped by their own tracks. */
export const due = internalQuery({
  args: { now: v.number() },
  returns: v.array(personV),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      if (!row.email || row.alertsOff || row.rejected) continue;
      // Once a day at most.
      if (row.alertsAt && now - row.alertsAt < 20 * 3_600_000) continue;
      const since = Math.max(row.alertsAt ?? 0, now - DAY);
      const tracks = (await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", row.userId)).take(50)).filter((t) => t.status === "active");
      if (!tracks.length) continue;
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
      if (!best.length) continue;
      const byTrack = new Map<string, { title: string; company: string; where: string; fit?: number; id: string }[]>();
      for (const { j, fit, key } of best) {
        const name = tracks.find((t) => t.key === key)!.name;
        const list = byTrack.get(name) ?? [];
        list.push({ title: j.title, company: j.company, where: j.location || "Not listed", fit, id: j._id });
        byTrack.set(name, list);
      }
      out.push({ accessId: row._id, email: row.email, name: row.name, groups: [...byTrack].map(([track, jobs]) => ({ track, jobs })) });
    }
    return out;
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
    const people: Person[] = await ctx.runQuery(internal.alerts.due, { now: Date.now() });
    if (dryRun) return people.map((p) => `${p.email}: ${p.groups.map((g) => `${g.track} (${g.jobs.length})`).join(", ")}`).join("\n") || "Nobody due.";
    let sent = 0;
    for (const p of people) {
      try {
        await sendEmail({ to: p.email, ...alertsEmail(p) });
        await ctx.runMutation(internal.alerts.markSent, { accessId: p.accessId });
        sent++;
      } catch (err) {
        // One bad address doesn't stop the rest.
        console.warn("New-roles email failed for", p.email, String(err));
      }
    }
    return `Sent ${sent} of ${people.length}.`;
  },
});
