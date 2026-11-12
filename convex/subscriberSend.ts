"use node";

// Sends the jobs email to people without an account (subscribers.ts): the first one the moment they sign up,
// then each morning with roles the careers boards turned up since their last email.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import { emailOn, sendEmail, subscriberEmail, unsubscribeLink } from "./lib/email";
import { jobMode } from "./lib/defaults";
import { otherFunction, trackForTitle } from "./lib/salesRoles";
import { openTo, readPlace } from "./lib/sources";

const DAY = 86_400_000;
const PER_EMAIL = 10;

type Role = { externalId: string; company: string; title: string; location: string; workSetting?: string; url: string };

/**
 * The roles that fit someone's titles and place, under the first title each one fits. Each title gets a fair
 * share of the PER_EMAIL places, and a role posted twice (same title, same company) shows once.
 */
/** Job boards that run their own careers page: they aren't the employer, so their roles stay out (as on the guides). */
const AGGREGATORS = /\b(jobgether|bebee|talent\.com|jooble|careerjet)\b/i;

export function matchRoles(sub: { titles: string[]; location: string }, roles: Role[]) {
  // "Remote" here means remote and open to India: a remote role tied to New York is no use to these readers.
  const remoteOnly = /^remote$/i.test(sub.location.trim());
  const place = readPlace(remoteOnly ? "India" : sub.location);
  const groups = sub.titles.map((title) => ({ title, jobs: [] as { title: string; company: string; where: string; url: string }[] }));
  const share = Math.ceil(PER_EMAIL / Math.max(1, groups.length));
  const seen = new Set<string>();
  for (const r of roles) {
    const key = `${r.title}|${r.company}`.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key) || AGGREGATORS.test(r.company) || !openTo(place, r.location, r.workSetting, r.title)) continue;
    if (remoteOnly && jobMode(r.location, r.workSetting, r.title) !== "remote") continue;
    // The picked title closest to the job's ("Sales Manager" over "Head of Sales" for a Sales Manager role).
    const best = trackForTitle(groups.map((x) => ({ key: x.title, titles: [x.title] })), r.title);
    const g = groups.find((x) => x.title === best && !otherFunction(x.title, r.title));
    if (!g || g.jobs.length >= share) continue;
    seen.add(key);
    g.jobs.push({ title: r.title, company: r.company, where: r.location || "Not listed", url: r.url });
  }
  // Uneven shares (3 titles into 10) can go one over; trim the biggest group.
  while (groups.reduce((n, g) => n + g.jobs.length, 0) > PER_EMAIL) [...groups].sort((a, b) => b.jobs.length - a.jobs.length)[0].jobs.pop();
  return groups;
}

/** India searches skip the thousands of US roles. */
const inIndia = (location: string) => {
  if (/^remote$/i.test(location.trim())) return true;
  const p = readPlace(location);
  return p.kind === "place" && (p.country === "in" || /^india$/i.test(p.name));
};

/**
 * Roles for a first email: the last 3 days' new ones first, then the title search. The search alone can be
 * swamped by one company's repeats ("Customer Service / Sales Executive" for "Customer Success Manager").
 */
async function openNow(ctx: ActionCtx, titles: string[], location: string): Promise<Role[]> {
  const [recent, found] = await Promise.all([
    ctx.runQuery(internal.subscribers.newRoles, { since: Date.now() - 3 * DAY }),
    ctx.runQuery(internal.careers.search, { titles, india: inIndia(location) }),
  ]);
  return [...recent, ...found].filter((r: Role) => !r.externalId.startsWith("linkedin:"));
}

/** Right after sign-up: what's open now for their titles, so the first email is worth opening. */
export const sendFirst = internalAction({
  args: { id: v.id("subscribers") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const sub: Doc<"subscribers"> | null = await ctx.runQuery(internal.subscribers.get, { id });
    if (!sub || sub.off || !emailOn()) return null;
    const groups = matchRoles(sub, await openNow(ctx, sub.titles, sub.location));
    const { url, headers } = unsubscribeLink(sub.key);
    await sendEmail({ to: sub.email, headers, ...subscriberEmail({ email: sub.email, place: sub.location, groups, unsubscribeUrl: url, first: true }) });
    await ctx.runMutation(internal.subscribers.markSent, { id, at: Date.now() });
    return null;
  },
});

/** For the owner: the first email someone would get, without signing anyone up. npx convex run subscriberSend:preview '{"titles":["SDR Manager"],"location":"Bengaluru"}' */
export const preview = internalAction({
  args: { titles: v.array(v.string()), location: v.string() },
  returns: v.string(),
  handler: async (ctx, { titles, location }) => {
    const mail = subscriberEmail({ email: "preview@example.com", place: location, groups: matchRoles({ titles, location }, await openNow(ctx, titles, location)), unsubscribeUrl: unsubscribeLink("preview").url, first: true });
    return `${mail.subject}\n\n${mail.text}`;
  },
});

/**
 * Each morning: everyone subscribed, with roles found since their last email. Nothing new, no email.
 * At most SUBSCRIBER_DAILY a day (default 40), longest-waiting first, to leave the email plan room for members.
 */
export const sendDaily = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { dryRun }): Promise<string> => {
    if (!emailOn() && !dryRun) return "Email is off.";
    const now = Date.now();
    const subs: Doc<"subscribers">[] = await ctx.runQuery(internal.subscribers.active, {});
    if (!subs.length) return "Nobody subscribed.";
    // One read of the last day's roles serves everyone. Anyone last emailed earlier than that only gets the last day.
    const roles: (Role & { at: number })[] = await ctx.runQuery(internal.subscribers.newRoles, { since: now - DAY - 3_600_000 });
    const cap = Number(env.SUBSCRIBER_DAILY ?? 40);
    const lines: string[] = [];
    let sent = 0;
    let failed = 0;
    for (const sub of [...subs].sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0))) {
      if (sent >= cap) break;
      // Sent in the last 20 hours (just signed up, or a second run today): wait for tomorrow.
      if (sub.sentAt && now - sub.sentAt < 20 * 3_600_000) continue;
      const groups = matchRoles(sub, roles.filter((r) => r.at > (sub.sentAt ?? 0)));
      const count = groups.reduce((n, g) => n + g.jobs.length, 0);
      if (!count) continue;
      if (dryRun) {
        lines.push(`${sub.email}: ${groups.map((g) => `${g.title} (${g.jobs.length})`).join(", ")}`);
        sent++;
        continue;
      }
      try {
        const { url, headers } = unsubscribeLink(sub.key);
        await sendEmail({ to: sub.email, headers, ...subscriberEmail({ email: sub.email, place: sub.location, groups, unsubscribeUrl: url }) });
        await ctx.runMutation(internal.subscribers.markSent, { id: sub._id as Id<"subscribers">, at: now });
        sent++;
      } catch (err) {
        failed++;
        console.warn("Subscriber jobs email failed for", sub.email, String(err));
      }
    }
    if (dryRun) return lines.join("\n") || "Nobody due.";
    return `Sent ${sent} of ${subs.length} subscribers${failed ? `, ${failed} failed` : ""}.`;
  },
});
