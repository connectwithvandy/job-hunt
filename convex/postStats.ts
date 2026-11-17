// Anonymous totals for the owner's LinkedIn posts: how people use JobPipe, never who.
// npx convex run --prod postStats:run '{}'

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

/** One person's last 7 days, per role: jobs found, strong fits and a few titles to eyeball. */
export const personWeek = internalQuery({
  args: { userId: v.id("users"), since: v.number() },
  returns: v.any(),
  handler: async (ctx, { userId, since }) => {
    const tracks = await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", userId)).take(50);
    const name = new Map(tracks.map((t) => [t.key, t.name]));
    const per: Record<string, { jobs: number; scored: number; strong: number; fitSum: number; titles: string[]; cities: Record<string, number> }> = {};
    for await (const j of ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc")) {
      if (j._creationTime < since) break;
      const key = j.foundFor ?? j.trackKey ?? "other";
      const role = name.get(key) ?? key;
      const r = (per[role] ??= { jobs: 0, scored: 0, strong: 0, fitSum: 0, titles: [], cities: {} });
      r.jobs++;
      const best = Math.max(0, ...(j.scores ?? []).map((s) => s.score));
      if (j.scores?.length) {
        r.scored++;
        r.fitSum += best;
        if (best >= 70) r.strong++;
      }
      if (r.titles.length < 6 && r.jobs % 7 === 1) r.titles.push(`${j.title} @ ${j.company} (${j.location.slice(0, 30)})${j.scores?.length ? ` fit ${best}` : ""}`);
      const city = /remote/i.test(`${j.workSetting ?? ""} ${j.location}`) ? "Remote" : j.location.split(/[,;|]/)[0].trim().slice(0, 20);
      r.cities[city] = (r.cities[city] ?? 0) + 1;
    }
    return {
      roles: tracks.filter((t) => t.status === "active").map((t) => t.name),
      perRole: Object.entries(per).map(([role, r]) => ({
        role,
        jobs: r.jobs,
        scored: r.scored,
        strong: r.strong,
        avgFit: r.scored ? Math.round(r.fitSum / r.scored) : null,
        topCities: Object.entries(r.cities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} ${n}`),
        sample: r.titles,
      })),
    };
  },
});

export const reviewPeople = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const r of rows) {
      const p = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", r.userId)).unique();
      const t = await ctx.db.query("usageTotals").withIndex("by_userId", (q) => q.eq("userId", r.userId)).unique();
      out.push({ userId: r.userId, email: r.email, location: p?.location ?? "", lastSeenAt: p?.lastSeenAt ?? null, tailored: t?.tailored ?? 0, applied: t?.applied ?? 0 });
    }
    return out;
  },
});

/**
 * A customer review: for each role (SDR, AE…), are people getting the right jobs? Plus each person's last 7 days.
 * npx convex run --prod postStats:customerReview '{}'
 */
export const customerReview = internalAction({
  args: { days: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, { days = 7 }): Promise<Record<string, unknown>> => {
    const now = Date.now();
    const since = now - days * 86_400_000;
    const people: { userId: Id<"users">; email: string; location: string; lastSeenAt: number | null; tailored: number; applied: number }[] = await ctx.runQuery(internal.postStats.reviewPeople, {});
    type Week = { roles: string[]; perRole: { role: string; jobs: number; scored: number; strong: number; avgFit: number | null; topCities: string[]; sample: string[] }[] };
    const byRole: Record<string, { people: number; jobs: number; scored: number; strong: number; fitSum: number; noJobs: number; sample: string[] }> = {};
    const rows: string[] = [];
    for (const p of people) {
      const w: Week = await ctx.runQuery(internal.postStats.personWeek, { userId: p.userId, since });
      for (const role of w.roles) {
        const r = w.perRole.find((x) => x.role === role);
        const b = (byRole[role] ??= { people: 0, jobs: 0, scored: 0, strong: 0, fitSum: 0, noJobs: 0, sample: [] });
        b.people++;
        if (!r || !r.jobs) b.noJobs++;
        if (r) {
          b.jobs += r.jobs;
          b.scored += r.scored;
          b.strong += r.strong;
          b.fitSum += (r.avgFit ?? 0) * r.scored;
          for (const s of r.sample) if (b.sample.length < 12) b.sample.push(s);
        }
      }
      const seen = p.lastSeenAt ? `${Math.floor((now - p.lastSeenAt) / 86_400_000)}d ago` : "never";
      const parts = w.perRole.filter((r) => w.roles.includes(r.role)).map((r) => `${r.role}: ${r.jobs} jobs, ${r.strong}/${r.scored} strong, ${r.topCities.join("/")}`);
      rows.push(`${p.email} · ${p.location || "no place"} · seen ${seen} · tailored ${p.tailored} · applied ${p.applied} · ${parts.join(" | ") || "no jobs this week"}`);
    }
    return {
      days,
      byRole: Object.entries(byRole)
        .sort((a, b) => b[1].people - a[1].people)
        .map(([role, b]) => ({
          role,
          people: b.people,
          peopleWithNoJobs: b.noJobs,
          jobsPerPerson: Math.round(b.jobs / b.people),
          strongPerPerson: +(b.strong / b.people).toFixed(1),
          avgFit: b.scored ? Math.round(b.fitSum / b.scored) : null,
          sample: b.sample,
        })),
      people: rows,
    };
  },
});

/** One page of India roles in the shared table, with each one's description, boiled down to counts. */
export const marketPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.any(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("careerJobs").paginate({ numItems: 150, cursor });
    const rows = [];
    for (const j of page.page) {
      if (!j.india) continue;
      const text = await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", j.externalId)).first();
      rows.push({ title: j.title, company: j.company, location: j.location, workSetting: j.workSetting ?? "", postedAt: j.postedAt ?? "", salary: j.salary ?? "", seen: j._creationTime, text: (text?.description ?? "").slice(0, 8000) });
    }
    return { rows, cursor: page.continueCursor, done: page.isDone };
  },
});

/**
 * Market facts for posts, from the India sales roles we hold and their descriptions:
 * npx convex run --prod postStats:market '{}'
 */
export const market = internalAction({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<Record<string, unknown>> => {
    type Row = { title: string; company: string; location: string; workSetting: string; postedAt: string; salary: string; seen: number; text: string };
    const all: Row[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 2000; i++) {
      const p: { rows: Row[]; cursor: string; done: boolean } = await ctx.runQuery(internal.postStats.marketPage, { cursor });
      all.push(...p.rows);
      if (p.done) break;
      cursor = p.cursor;
    }
    const withText = all.filter((r) => r.text.length > 300);
    const share = (re: RegExp, rows = withText) => (rows.length ? `${Math.round((rows.filter((r) => re.test(`${r.title} ${r.text}`)).length / rows.length) * 100)}%` : "-");
    const family = (t: string) =>
      /\b(sdr|bdr|sales development|business development rep|lead development)\b/i.test(t) ? "SDR/BDR"
      : /\baccount executive|\bae\b/i.test(t) ? "Account Executive"
      : /\b(business development executive|bde)\b/i.test(t) ? "BDE"
      : /\b(account manager|customer success|kam)\b/i.test(t) ? "Account/Customer Success"
      : /\b(head|director|vp|vice president|chief)\b/i.test(t) ? "Head/Director/VP"
      : /\bmanager\b/i.test(t) ? "Other manager" : "Other";
    const fam: Record<string, number> = {};
    for (const r of all) fam[family(r.title)] = (fam[family(r.title)] ?? 0) + 1;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekday: Record<string, number> = {};
    for (const r of all) {
      const t = Date.parse(r.postedAt);
      if (!Number.isNaN(t) && /T\d/.test(r.postedAt)) weekday[days[new Date(t + 19_800_000).getUTCDay()]] = (weekday[days[new Date(t + 19_800_000).getUTCDay()]] ?? 0) + 1;
    }
    const dated = all.filter((r) => !Number.isNaN(Date.parse(r.postedAt)));
    const old = dated.filter((r) => r.seen - Date.parse(r.postedAt) > 30 * 86_400_000).length;
    // Years of experience asked, by family: the lower bound of "3-5 years", "4+ years".
    const yearsFor = (rows: Row[]) => {
      const ys = rows.map((r) => r.text.match(/\b(\d{1,2})\s*(?:\+|-|–|to)\s*(?:\d{1,2}\s*)?(?:years|yrs)/i)).filter(Boolean).map((m) => Number(m![1])).filter((n) => n <= 20);
      return ys.length ? { median: median(ys), of: ys.length } : null;
    };
    const byFam = (f: string) => withText.filter((r) => family(r.title) === f);
    const cities: Record<string, number> = {};
    for (const r of all) {
      const c = /remote/i.test(`${r.workSetting} ${r.location}`) ? "Remote" : /bengaluru|bangalore/i.test(r.location) ? "Bengaluru" : /mumbai|navi mumbai|thane/i.test(r.location) ? "Mumbai" : /delhi|gurgaon|gurugram|noida|ncr/i.test(r.location) ? "Delhi NCR" : /hyderabad/i.test(r.location) ? "Hyderabad" : /pune/i.test(r.location) ? "Pune" : /chennai/i.test(r.location) ? "Chennai" : "Elsewhere";
      cities[c] = (cities[c] ?? 0) + 1;
    }
    return {
      indiaRoles: all.length,
      withDescription: withText.length,
      byKind: fam,
      byCity: cities,
      listPay: `${Math.round((all.filter((r) => r.salary || /₹|inr|lpa|ctc|lakhs?\b|per annum/i.test(r.text)).length / Math.max(1, all.length)) * 100)}%`,
      postedWeekday: weekday,
      olderThan30DaysWhenSeen: dated.length ? `${Math.round((old / dated.length) * 100)}% of ${dated.length}` : "-",
      mentions: {
        "AI / GenAI": share(/\b(ai|genai|gen ai|artificial intelligence|llm)\b/i),
        Salesforce: share(/\bsalesforce\b/i),
        HubSpot: share(/\bhubspot\b/i),
        "MEDDIC / MEDDPICC": share(/\bmedd?p?icc?\b/i),
        "Quota / target": share(/\b(quota|targets?)\b/i),
        "Cold calling": share(/\bcold[- ]call/i),
        "US / UK shift or night shift": share(/\b(us|uk|night|emea|north america)\s*(shift|hours|time ?zone)\b/i),
        "Work from office / on-site": share(/\b(work from office|wfo|on-?site|in-office)\b/i),
        "Commission / incentives / OTE": share(/\b(commission|incentives?|ote|on-target)\b/i),
        "ESOPs / equity": share(/\b(esops?|equity|stock options?)\b/i),
        "LinkedIn Sales Navigator": share(/\bsales navigator\b/i),
        "Apollo / Outreach / Gong": share(/\b(apollo|outreach|salesloft|gong)\b/i),
        Hindi: share(/\bhindi\b/i),
        "Travel": share(/\btravel(l)?ing\b|\btravel required|willing to travel/i),
        "Freshers welcome": share(/\bfreshers?\b/i),
      },
      yearsAsked: { "SDR/BDR": yearsFor(byFam("SDR/BDR")), "Account Executive": yearsFor(byFam("Account Executive")), "Head/Director/VP": yearsFor(byFam("Head/Director/VP")) },
    };
  },
});
