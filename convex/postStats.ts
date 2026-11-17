// Anonymous totals for the owner's LinkedIn posts: how people use JobPipe, never who.
// npx convex run --prod postStats:run '{}'

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { readPlace } from "./lib/sources";

const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} (${c})`);
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Everything except the jobs table, which is read in pages (jobsPage). */
export const small = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const totals = await ctx.db.query("usageTotals").take(2000);
    const tracks = await ctx.db.query("tracks").take(5000);
    const reviews = await ctx.db.query("cvReviews").take(1000);
    const profiles = await ctx.db.query("profiles").take(2000);

    const perUser = new Map<string, number>();
    const roleNames = new Map<string, number>();
    for (const t of tracks) {
      bump(perUser, t.userId);
      bump(roleNames, t.name);
    }
    const cities = new Map<string, number>();
    for (const p of profiles) for (const c of (p.location ?? "").split(/[,;/]| or /i).map((x) => x.trim()).filter(Boolean)) bump(cities, c);
    // People searching outside India: who a dollar or euro price would apply to.
    const abroad = new Map<string, number>();
    for (const p of profiles) {
      const place = readPlace(p.location ?? "");
      if (place.kind === "place" && place.country !== "in") bump(abroad, p.location);
    }

    // What the free CV reviews most often say is missing, in plain buckets.
    const buckets: [string, RegExp][] = [
      ["numbers (quota, revenue, pipeline, %)", /number|metric|quota|revenue|pipeline|%|attainment|quantif/i],
      ["a summary aimed at the role", /summary|headline|objective/i],
      ["tools (CRM, Salesforce, outreach tools)", /crm|salesforce|hubspot|tool|outreach|apollo/i],
      ["deal sizes or customer names", /deal size|acv|arr|customer|client|logo/i],
    ];
    const missing = new Map<string, number>();
    for (const r of reviews) {
      const text = [...r.review.missing, ...r.review.fixes.map((f) => `${f.what} ${f.why}`)].join(" ");
      for (const [name, re] of buckets) if (re.test(text)) bump(missing, name);
    }
    const scores = reviews.map((r) => r.score);

    return {
      people: totals.length,
      jobsFound: totals.reduce((n, t) => n + t.jobs, 0),
      jobsScored: totals.reduce((n, t) => n + t.scored, 0),
      cvsTailored: totals.reduce((n, t) => n + t.tailored, 0),
      applied: totals.reduce((n, t) => n + t.applied, 0),
      medianJobsPerPerson: median(totals.map((t) => t.jobs)),
      rolesPerPerson: perUser.size ? +(tracks.length / perUser.size).toFixed(1) : 0,
      topRoles: top(roleNames, 8),
      topCities: top(cities, 8),
      searchingAbroad: top(abroad, 30),
      cvReviews: reviews.length,
      cvReviewAverage: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      cvReviews70Plus: scores.filter((s) => s >= 70).length,
      cvReviewMissing: top(missing, 4),
    };
  },
});

/** One page of jobs, boiled down to counts so little leaves the database. */
export const jobsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.any(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("jobs").paginate({ numItems: 200, cursor });
    let scored = 0, sum = 0, s70 = 0, s85 = 0, max = 0, remote = 0;
    const statuses: Record<string, number> = {};
    const companies: Record<string, number> = {};
    const appliedTo: Record<string, number> = {};
    for (const j of page.page) {
      const best = Math.max(0, ...(j.scores ?? []).map((s) => s.score));
      if (j.scores?.length) {
        scored++;
        sum += best;
        if (best >= 70) s70++;
        if (best >= 85) s85++;
        if (best > max) max = best;
      }
      if (/remote/i.test(`${j.workSetting ?? ""} ${j.location}`)) remote++;
      statuses[j.status] = (statuses[j.status] ?? 0) + 1;
      companies[j.company] = (companies[j.company] ?? 0) + 1;
      if (j.status !== "new" && j.status !== "dismissed") appliedTo[j.company] = (appliedTo[j.company] ?? 0) + 1;
    }
    // Lists, not objects: company names like "Nestlé" can't be field names.
    return { n: page.page.length, scored, sum, s70, s85, max, remote, statuses: Object.entries(statuses), companies: Object.entries(companies), appliedTo: Object.entries(appliedTo), cursor: page.continueCursor, done: page.isDone };
  },
});

type JobsPage = {
  n: number; scored: number; sum: number; s70: number; s85: number; max: number; remote: number;
  statuses: [string, number][]; companies: [string, number][]; appliedTo: [string, number][];
  cursor: string; done: boolean;
};

export const run = internalAction({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const base: Record<string, unknown> = await ctx.runQuery(internal.postStats.small, {});
    let cursor: string | null = null;
    let n = 0, scored = 0, sum = 0, s70 = 0, s85 = 0, max = 0, remote = 0;
    const statuses = new Map<string, number>();
    const companies = new Map<string, number>();
    const appliedTo = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const p: JobsPage = await ctx.runQuery(internal.postStats.jobsPage, { cursor });
      n += p.n; scored += p.scored; sum += p.sum; s70 += p.s70; s85 += p.s85; remote += p.remote;
      max = Math.max(max, p.max);
      for (const [k, c] of p.statuses) bump(statuses, k, c);
      for (const [k, c] of p.companies) bump(companies, k, c);
      for (const [k, c] of p.appliedTo) bump(appliedTo, k, c);
      if (p.done) break;
      cursor = p.cursor;
    }
    return {
      ...base,
      jobsInLists: n,
      aiScored: scored,
      averageFit: scored ? Math.round(sum / scored) : 0,
      fit70Plus: scored ? `${s70} (${Math.round((s70 / scored) * 100)}%)` : "0",
      fit85Plus: s85,
      highestFit: max,
      remoteShare: n ? `${Math.round((remote / n) * 100)}%` : "0%",
      statuses: Object.fromEntries(statuses),
      companiesInMostLists: top(companies, 10),
      companiesMovedForward: top(appliedTo, 10),
    };
  },
});

/**
 * Emails sent in the last 24 hours, by kind, from each row's "last sent" time (so a kind sent twice to one person
 * counts once). For checking the email plan's 100-a-day limit: npx convex run --prod postStats:emailsToday '{}'
 */
export const emailsToday = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const since = Date.now() - 86_400_000;
    const recent = (t?: number) => (t ?? 0) > since;
    const access = await ctx.db.query("access").take(2000);
    const subs = await ctx.db.query("subscribers").take(5000);
    const offers = await ctx.db.query("offerSends").take(2000);
    const reviews = await ctx.db.query("cvReviews").take(2000);
    const kinds: Record<string, number> = {
      "new-roles emails (members)": access.filter((r) => recent(r.alertsAt)).length,
      "jobs emails (email-only subscribers)": subs.filter((s) => recent(s.sentAt)).length,
      "founding offer": offers.filter((o) => recent(o.sentAt)).length,
      "welcome / you're in": access.filter((r) => recent(r.welcomedAt)).length,
      "trial check-in": access.filter((r) => recent(r.trialNoteAt)).length,
      "trial extended / ended": access.filter((r) => recent(r.trialExtendedAt) || recent(r.trialEndedNoteAt)).length,
      "setup nudges": access.filter((r) => recent(r.setupNudgeAt) || recent(r.setupNudge2At)).length,
      "feedback asks": access.filter((r) => recent(r.feedbackAskedAt)).length,
      "shoutout asks": access.filter((r) => recent(r.shoutoutAskedAt)).length,
      "CV review follow-ups": reviews.filter((r) => recent(r.followedUpAt)).length,
    };
    const total = Object.values(kinds).reduce((a, b) => a + b, 0);
    return { total, kinds, subscribers: subs.length, note: "Plus the owner's morning email, sign-in/reset emails and any instant alerts, which aren't timed here." };
  },
});
