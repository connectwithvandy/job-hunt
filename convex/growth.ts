// Free growth on autopilot. Each morning the owner gets one email (sendMorning): who's waiting, a ready LinkedIn post,
// the strongest open-to-work people with a comment to leave on their post, and any errors. Each Monday,
// a post about sales roles that keep getting reposted; and anyone let in who hasn't finished setup gets one nudge.
// The posts never name where the jobs come from.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { type ActionCtx, env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { AUTOPILOT_SCORES } from "./lib/defaults";
import { healthSection } from "./lib/health";
import { CAREER_BOARDS } from "./lib/careerBoards";
import { AGGREGATORS, companyKey, roleKey } from "./lib/company";
import { searchJobs, searchPosts } from "./lib/apify";
import { appUrl, emailOn, feedbackEmail, noteEmail, sendEmail, setupNudgeEmail, setupReminderEmail } from "./lib/email";
import { isLender } from "./lib/quickFit";
import { backOffice, SALES_ROLES, titleMatches } from "./lib/salesRoles";

const DAY = 86_400_000;
const ALL_TITLES = [...new Set(SALES_ROLES.flatMap((r) => r.titles))];

/** A sales job by its title, leaving out finance roles that only borrow sales words. */
export function isSalesTitle(title: string) {
  return !backOffice(title) && ALL_TITLES.some((t) => titleMatches(t, title));
}

const PICKED_COMPANIES = new Set(CAREER_BOARDS.map((b) => companyKey(b.name)));
// Startups hire on these. Big non-tech firms (Dr Reddy's, Equifax) arrive through Workday and SmartRecruiters
// boards found in job links, so a company on those counts only if it was picked by hand.
const STARTUP_BOARD = /(^|\.)(ashbyhq\.com|greenhouse\.io|lever\.co|rippling\.com)(\/|$)/i;

/** A SaaS, tech or AI company, as far as its name and job link can tell: the public post lists only these. */
export function isTechCompany(company: string, title: string, url: string) {
  if (PICKED_COMPANIES.has(companyKey(company))) return true;
  return STARTUP_BOARD.test(url.replace(/^https?:\/\//i, "")) && !isLender(title, company);
}

const ownerEmail = () => (env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean)[0];

/** "Bengaluru, Karnataka, India" or "Pune-Maharashtra-India" as "Bengaluru" / "Pune"; remote roles say "Remote". */
export function place(location: string, workSetting?: string) {
  if (/remote|anywhere/i.test(location) && !/hybrid/i.test(location)) return "Remote";
  // "Hybrid - Bengaluru" or "Remote, India": the first part that names a place. Workday joins with bare dashes.
  const parts = location.split(/[,;|/()]|\s-\s|-(?=[A-Z])/).map((p) => p.trim()).filter(Boolean);
  const city = (parts.find((p) => !/^(hybrid|remote|on-?site|office|india)$/i.test(p)) ?? "India").slice(0, 30);
  return /remote/i.test(workSetting ?? "") ? `${city} or remote` : city;
}

const jobV = v.object({ company: v.string(), title: v.string(), where: v.string(), url: v.string() });

/** True when a job was posted in the last 24 hours. A date with no time counts as the end of that day. */
export function postedInLastDay(postedAt: string | undefined, now: number) {
  const t = postedAt ? Date.parse(postedAt) : NaN;
  if (Number.isNaN(t)) return false;
  return (/^\d{4}-\d{2}-\d{2}$/.test(postedAt!.trim()) ? t + DAY : t) >= now - DAY;
}

/** Which part of the post a job belongs to: SDRs, AEs or sales managers. Null keeps it out of the post. */
export function postGroup(title: string): "sdr" | "ae" | "manager" | null {
  // "Lead Generation Virtual Assistant" shares words with an SDR role but is admin work.
  if (/operations|enablement|engineer|marketing|partner|channel|customer success|assistant|virtual|catering/i.test(title)) return null;
  if (/\b(manager|head|director|vp|vice president|lead)\b/i.test(title)) return /\b(sales|sdr|bdr|business development|revenue)\b/i.test(title) ? "manager" : null;
  if (/\b(sdr|bdr|bde|sales development|business development|inside sales|lead development|market development|account development|outbound sales)\b/i.test(title)) return "sdr";
  if (/\b(account executive|ae|sales executive)\b/i.test(title)) return "ae";
  return null;
}

/** Up to n jobs, half SDRs and half the closing side (AEs and sales managers). A side with too few leaves room for the other. */
export function mixJobs<T extends { title: string }>(jobs: T[], n: number) {
  const groups: Record<"sdr" | "ae" | "manager", T[]> = { sdr: [], ae: [], manager: [] };
  for (const j of jobs) {
    const g = postGroup(j.title);
    if (g) groups[g].push(j);
  }
  const turns = ["sdr", "ae", "sdr", "manager"] as const;
  const out: T[] = [];
  for (let i = 0; out.length < n && i < jobs.length * turns.length; i++) {
    const next = groups[turns[i % turns.length]].shift();
    if (next) out.push(next);
  }
  return out;
}

/** "KAM - Manager (Mumbai)" in Mumbai reads "KAM - Manager": the place is shown once, after the title. */
export function jobLine(j: { company: string; title: string; where: string; url: string }) {
  const title = j.title.replace(/\s*\(([^)]*)\)\s*$/, (all, inside: string) => (inside.trim().toLowerCase() === j.where.toLowerCase() ? "" : all));
  return `• ${j.company}, ${title} (${j.where})\n${j.url}`;
}

/** Sales roles at tech companies in India posted in the last 24 hours and new on careers boards, one or two per company. */
export const newSalesJobs = internalQuery({
  args: { now: v.number() },
  returns: v.array(jobV),
  handler: async (ctx, { now }) => {
    const out: { company: string; title: string; where: string; url: string }[] = [];
    const perCompany = new Map<string, number>();
    const titles = new Set<string>();
    // Newest first; stop at the first one older than a day, so only today's arrivals are read.
    for await (const j of ctx.db.query("careerJobs").order("desc")) {
      if (j._creationTime < now - DAY) break;
      // Internships aren't what sales people following the post are after.
      if (!j.india || !isSalesTitle(j.title) || /\bintern(ship)?\b/i.test(j.title)) continue;
      if (AGGREGATORS.test(j.company) || !isTechCompany(j.company, j.title, j.url)) continue;
      // The post promises the last 24 hours. A board seen for the first time brings old roles too,
      // and no date could mean months old, so both stay out.
      if (!postedInLastDay(j.postedAt, now)) continue;
      const n = perCompany.get(j.company) ?? 0;
      const key = roleKey(j.company, j.title);
      if (n >= 2 || titles.has(key)) continue;
      titles.add(key);
      perCompany.set(j.company, n + 1);
      out.push({ company: j.company, title: j.title, where: place(j.location, j.workSetting), url: j.url });
    }
    return out;
  },
});

/** Open sales roles in India that have come back after being taken down, most reposted first. */
export const repostedSalesJobs = internalQuery({
  args: {},
  returns: v.array(v.object({ company: v.string(), title: v.string(), reposts: v.number(), since: v.number() })),
  handler: async (ctx) => {
    const seen = new Map<string, { company: string; title: string; reposts: number; since: number }>();
    for (const term of ALL_TITLES) {
      const rows = await ctx.db
        .query("careerJobs")
        .withSearchIndex("search_title", (q) => q.search("title", term).eq("india", true))
        .take(30);
      for (const j of rows) {
        const key = roleKey(j.company, j.title);
        if (seen.has(key) || !isSalesTitle(j.title)) continue;
        const s = await ctx.db.query("roleSightings").withIndex("by_key", (q) => q.eq("key", key)).first();
        if (s && s.reposts >= 1) seen.set(key, { company: j.company, title: j.title, reposts: s.reposts, since: s.firstSeen });
      }
    }
    return [...seen.values()].sort((a, b) => b.reposts - a.reposts).slice(0, 10);
  },
});

const TAGS = "#salesjobs #hiring #SDR #AccountExecutive #salesindia";

type PostJob = { company: string; title: string; where: string; url: string };

// One search per side of the post, so sales managers don't crowd out the rest.
const POST_SEARCHES = [
  `"Sales Development Representative" OR "SDR" OR "Business Development Representative" OR "BDR"`,
  `"Account Executive" OR "Enterprise Account Executive" OR "Senior Account Executive"`,
  `"Sales Manager" OR "Head of Sales" OR "Sales Development Manager" OR "Business Development Manager"`,
];

/** Today's sales jobs from LinkedIn at tech companies in India: about $0.09 a day, capped at $0.12. Empty when the search fails. */
async function linkedInPostJobs(ctx: ActionCtx, now: number): Promise<PostJob[]> {
  if (!env.APIFY_TOKEN) return [];
  const settled = await Promise.allSettled(POST_SEARCHES.map((q) => searchJobs([q], "India", false, "24h", 30, 0.04)));
  for (const r of settled) if (r.status === "rejected") console.warn("Post job search failed:", String(r.reason));
  const rows = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((j) => !AGGREGATORS.test(j.company) && isSalesTitle(j.title) && postGroup(j.title) && !/\bintern(ship)?\b/i.test(j.title) && !isLender(j.title, j.company))
    .filter((j) => !j.postedAt || postedInLastDay(j.postedAt, now));
  // A LinkedIn link says nothing about the company, so the AI picks out the tech ones by name.
  const names = [...new Set(rows.map((j) => j.company))];
  const tech = new Set<string>((await ctx.runAction(internal.growthNotes.techCompanies, { names })).map(companyKey));
  return rows
    .filter((j) => tech.has(companyKey(j.company)) || isTechCompany(j.company, j.title, j.applyUrl ?? j.url))
    .map((j) => ({ company: j.company, title: j.title, where: place(j.location, j.workSetting), url: j.applyUrl ?? j.url }));
}

/** Today's LinkedIn post: new SDR, AE and sales manager jobs with their links, ready to paste. Null when too few to post. */
async function jobsPostSection(ctx: ActionCtx): Promise<string | null> {
  const now = Date.now();
  const [boards, linkedIn]: [PostJob[], PostJob[]] = await Promise.all([ctx.runQuery(internal.growth.newSalesJobs, { now }), linkedInPostJobs(ctx, now)]);
  // Careers boards first: they link straight to the company. One role once, two per company at most.
  const seen = new Set<string>();
  const perCompany = new Map<string, number>();
  const pool = [...boards, ...linkedIn].filter((j) => {
    const key = roleKey(j.company, j.title);
    const company = companyKey(j.company);
    const n = perCompany.get(company) ?? 0;
    if (seen.has(key) || n >= 2) return false;
    seen.add(key);
    perCompany.set(company, n + 1);
    return true;
  });
  const jobs = mixJobs(pool, JOBS_PER_POST);
  // Too few to be worth a post: skip today rather than post something thin.
  if (jobs.length < 3) return null;
  const sdrs = jobs.filter((j) => postGroup(j.title) === "sdr");
  const closers = jobs.filter((j) => postGroup(j.title) !== "sdr");
  const list = (name: string, group: PostJob[]) => (group.length ? `${name}\n\n${group.map(jobLine).join("\n\n")}` : "");
  // Each job with its apply link right under it, so the post is ready to paste as is.
  const post = `${jobs.length} new sales jobs in India, posted in the last 24 hours 👇

${[list("SDR / BDR", sdrs), list("AE and sales managers", closers)].filter(Boolean).join("\n\n")}

I find these every morning with JobPipe, the tool I built for my own sales job hunt. It also scores each role against your CV and tailors the CV for you: https://jobpipe.in

${TAGS}`;
  return `LINKEDIN POST (copy everything between the lines; post before 10 am and reply to comments in the first hour)
------------
${post}
------------`;
}
const JOBS_PER_POST = 6;

/** Emails the owner a weekly post on sales roles that keep coming back, framed as a question to ask, not an accusation. */
export const sendRepostPost = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const owner = ownerEmail();
    if (!emailOn() || !owner) return null;
    const roles = await ctx.runQuery(internal.growth.repostedSalesJobs, {});
    if (roles.length < 3) return null;
    const month = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { month: "long", timeZone: "Asia/Kolkata" });
    const post = `These sales roles in India keep coming back. Each was taken down and then posted again:

${roles.map((r) => `• ${r.company}: ${r.title} (posted ${r.reposts + 1} times since ${month(r.since)})`).join("\n")}

A role that keeps coming back could mean a tough hire, people leaving fast, or a job that's "always open". It doesn't have to put you off, but it's worth asking in the interview: "How long has this role been open, and why?"

I track every repost with JobPipe, the tool I built for my own sales job hunt: jobpipe.in

#jobsearch #salesjobs #ghostjobs #hiring`;
    await sendEmail({
      to: owner,
      subject: `This week's LinkedIn post: ${roles.length} sales roles that keep coming back`,
      text: `Copy the post below into LinkedIn. It states facts (how often a role was reposted) and suggests a question to ask, without calling any company names.

--- Post ---
${post}
------------

${appUrl()}/admin`,
    });
    return null;
  },
});

/** People let in 2+ days ago who haven't finished setup and haven't had the nudge. */
export const needSetupNudge = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()), role: v.optional(v.string()) })),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      if (row.setupNudgeAt || !row.email || isOwnerEmail(row.email)) continue;
      if (!row.decidedAt || now - row.decidedAt < 2 * DAY) continue;
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
      if (profile?.onboarded) continue;
      out.push({ accessId: row._id, email: row.email, name: row.name, role: row.role });
    }
    return out;
  },
});

/** People let in 5 to 21 days ago, nudged at least 2 days ago, still not set up, and not yet asked what got stuck. */
export const needSecondNudge = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()) })),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      if (!row.setupNudgeAt || row.setupNudge2At || !row.email || isOwnerEmail(row.email)) continue;
      if (now - row.setupNudgeAt < 2 * DAY || !row.decidedAt || now - row.decidedAt < 5 * DAY || now - row.decidedAt > 21 * DAY) continue;
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
      if (profile?.onboarded) continue;
      out.push({ accessId: row._id, email: row.email, name: row.name });
    }
    return out;
  },
});

export const markSecondNudge = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.null(),
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { setupNudge2At: Date.now() });
    return null;
  },
});

export const markNudged = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.null(),
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { setupNudgeAt: Date.now() });
    return null;
  },
});

export const sendSetupNudges = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!emailOn()) return null;
    const people = await ctx.runQuery(internal.growth.needSetupNudge, { now: Date.now() });
    for (const p of people) {
      try {
        await sendEmail({ to: p.email, ...setupNudgeEmail(p) });
        await ctx.runMutation(internal.growth.markNudged, { accessId: p.accessId });
      } catch (err) {
        // One bad address doesn't stop the rest; it is tried again tomorrow.
        console.warn("Setup nudge failed for", p.email, String(err));
      }
    }
    const stuck = await ctx.runQuery(internal.growth.needSecondNudge, { now: Date.now() });
    for (const p of stuck) {
      try {
        await sendEmail({ to: p.email, ...setupReminderEmail(p) });
        await ctx.runMutation(internal.growth.markSecondNudge, { accessId: p.accessId });
      } catch (err) {
        console.warn("Second nudge failed for", p.email, String(err));
      }
    }
    return null;
  },
});

// Searches for sales and GTM people anywhere saying they're looking for work.
// Short searches: LinkedIn matches every word, so long ones come back nearly empty.
// Each search pairs the #opentowork tag (job seekers use it, hiring ads and advice posts don't) with one role.
const OPEN_TO_WORK_SEARCHES = [
  "#opentowork SDR",
  "#opentowork BDR",
  "#opentowork account executive",
  "#opentowork sales manager",
  "#opentowork GTM",
];
// The author talking about their own search ("I'm looking", "open to work"), not advice to people who are looking.
const LOOKING = /open to work|#opentowork|\bi(['’]m| am)( now| currently)? (actively )?(looking|seeking|exploring|open|available)|\bi (was|got) (laid off|let go|impacted)|\bmy (next|new) (role|opportunit|chapter)|\bimmediate joiner/i;
// Hiring posts say "looking for" too: "We're looking for an SDR". Those are recruiters, not job seekers.
// Not "#hiring", "is hiring" or "hiring a": job seekers write "if your team is hiring a…". LinkedIn often uses curly apostrophes ("We’re hiring"), so both kinds are matched.
const HIRING = /we(['’]| a)re (hiring|looking|growing)|we are hiring|i(['’]| a)m hiring|i am hiring|join (our|my) team|now hiring|urgent(ly)? (hiring|role|requirement)|\bhiring\s*[:|–—]|apply (now|here|via|at)|dm me your (cv|resume)|(send|share) (your|me your) (cv|resume)|share resume/i;
// Recruiters and hiring managers post about roles; they aren't the people JobPipe is for.
const RECRUITER = /recruit|talent acquisition|sourcer|\bhr\b|human resources|hiring manager/i;
/** The first n characters, never splitting an emoji in half (half an emoji is invalid text and broke a run). */
export function cut(text: string, n: number) {
  const chars = Array.from(text);
  return chars.length > n ? `${chars.slice(0, n).join("")}…` : text;
}

/** A sales person saying they're looking for work, not someone hiring for a role. */
/**
 * How strong a fit someone is for JobPipe, from their post and headline. 3 or more makes the email.
 * Up: a clear sales title in the headline, SaaS/B2B, an outright "open to work", years of experience.
 * Down: posts not in English (the message is in English), and stories without a clear ask.
 */
export function fitScore(text: string, headline: string) {
  const all = `${text} ${headline}`;
  let n = 0;
  if (/\b(sdr|bdr|sales development|business development|account executive|\bae\b|sales (leader|manager|director|executive|representative)|head of sales|vp,? sales|gtm|go-to-market|revops|revenue operations|account manager)/i.test(headline)) n += 2;
  if (/\b(saas|b2b|tech sales|enterprise)\b/i.test(all)) n += 1;
  if (/open to work|#opentowork|\bi(['’]m| am) (actively |currently )?(looking|seeking)/i.test(text)) n += 1;
  if (/\b\d+\+?\s*(years|yrs)\b/i.test(text)) n += 1;
  if (/\b(estoy|estou|busca|vagas|olá|hoy|experiencia|oportunidades|ricerca|recherche|suche)\b/i.test(text)) n -= 2;
  if (!/open to work|#opentowork|looking for|seeking|exploring|open to/i.test(text.slice(0, 300))) n -= 1;
  return n;
}
const STRONG = 3;
const PER_EMAIL = 3;

export function isSeekerPost(text: string, headline: string) {
  return !whyNot(text, headline);
}

/** The first check a post fails, or "" when it's a sales person looking for work. */
export function whyNot(text: string, headline: string) {
  const all = `${text} ${headline}`;
  if (!LOOKING.test(text)) return "not looking";
  if (HIRING.test(text)) return "hiring post";
  if (RECRUITER.test(headline)) return "recruiter";
  if (!SALES.test(headline)) return "not a sales/GTM headline";
  if (NOT_OUR_SALES.test(all)) return "field/consumer sales";
  return "";
}
// Sales and GTM roles JobPipe finds jobs for, read from the person's own headline so a passing mention doesn't count.
const SALES = /\b(sdr|bdr|sales development|business development|(it|b2b|saas|tech|software|enterprise|corporate|solution) sales|sales (professional|executive|specialist|representative|rep)\b|account executive|\bae\b|inside sales|enterprise sales|sales (manager|leader|director|head|lead)|head of sales|vp,? sales|chief revenue|cro\b|gtm|go-to-market|revenue operations|revops|key account manager|account manager|partnerships? manager)/i;
// Field and consumer sales are a different job market from the B2B and SaaS roles JobPipe covers.
const NOT_OUR_SALES = /\b(area sales|regional sales|territory|asm\b|rsm\b|retail|insurance|real estate|pharma|medical rep|fmcg|solar|channel sales|dealer|distributor|banking sales|loan|admissions?|test prep|printing|packaging)/i;

/** The owner's own comment, used only when the personal one can't be written. Same words on many posts look copied, so the email says when this happens. */
export function plainComment(name: string) {
  const word = name.trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") ?? "";
  // "PRAASHANT" reads as shouting: write it "Praashant".
  const first = word ? word[0].toUpperCase() + (word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1)) : "";
  return `${first ? `${first}, job` : "Job"} hunting is very similar to sales, you got to reach out to folks at the right time with the right context!

You can try https://jobpipe.in. It's built with sales mindset :) Happy to help either way.`;
}

/** Of these people, the ones not yet sent to the owner. */
export const unsentSeekers = internalQuery({
  args: { keys: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { keys }) => {
    const out: string[] = [];
    for (const key of keys) {
      const seen = await ctx.db.query("seekersSent").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (!seen) out.push(key);
    }
    return out;
  },
});

export const markSeekersSent = internalMutation({
  args: { keys: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { keys }) => {
    for (const key of keys) await ctx.db.insert("seekersSent", { key, at: Date.now() });
    return null;
  },
});

/**
 * Each morning: LinkedIn posts from the last day by sales people looking for work, emailed to the owner to comment on
 * by hand. Never comments or messages on its own: LinkedIn bans accounts for that.
 */
type SeekerPost = Awaited<ReturnType<typeof searchPosts>>[number];
const keyOf = (p: SeekerPost) => p.author.url || p.url;

/** The strongest new open-to-work people this week, best first, not sent before. A string when the search failed. */
async function pickSeekers(ctx: ActionCtx): Promise<{ posts: SeekerPost[]; picked: SeekerPost[] } | string> {
  if (!env.APIFY_TOKEN) return "Apify key missing.";
  let posts: SeekerPost[];
  try {
    // The past week, 20 a search (about $0.20): one day only turned up one or two people.
    posts = await searchPosts(OPEN_TO_WORK_SEARCHES, 20, "week");
  } catch (err) {
    console.warn("Open-to-work search failed", String(err));
    return `Search failed: ${String(err)}`;
  }
  // One entry per person, keyed by their profile (or the post when there's no profile link).
  const byPerson = new Map<string, SeekerPost>();
  for (const p of posts) if (p.url && isSeekerPost(p.text, p.author.headline) && !byPerson.has(keyOf(p))) byPerson.set(keyOf(p), p);
  const unsent: string[] = await ctx.runQuery(internal.growth.unsentSeekers, { keys: [...byPerson.keys()] });
  const fresh = new Set(unsent);
  // Only the strongest fits, best first.
  const picked = [...byPerson.values()]
    .filter((p) => fresh.has(keyOf(p)) && fitScore(p.text, p.author.headline) >= STRONG)
    .sort((a, b) => fitScore(b.text, b.author.headline) - fitScore(a.text, a.author.headline))
    .slice(0, PER_EMAIL);
  return { posts, picked };
}

function seekersSection(picked: SeekerPost[], comments: (string | null)[], error?: string) {
  const snippet = (t: string) => cut(t.replace(/\s+/g, " ").trim(), 220);
  return `SALES PEOPLE LOOKING FOR WORK (about 5 minutes: paste each comment under their post by hand; never automate this)${error ? `\n\nThe personal comments failed today, so these are your plain one. Change the words before posting. Reason: ${cut(error, 160)}` : ""}

${picked
  .map((p, i) => `${i + 1}. ${p.author.name}${p.author.headline ? `, ${cut(p.author.headline, 90)}` : ""}
   "${snippet(p.text)}"
   Post: ${p.url}${p.author.url ? `\n   Profile: ${p.author.url}` : ""}
   Comment:

${comments[i] ?? plainComment(p.author.name)}`)
  .join("\n\n")}`;
}

/** Shows every open-to-work post found and why each was kept or left out, without sending anything. */
export const previewSeekers = internalAction({
  args: {},
  returns: v.string(),
  handler: async () => {
    if (!env.APIFY_TOKEN) return "Apify key missing.";
    const posts = await searchPosts(OPEN_TO_WORK_SEARCHES, 20, "week");
    return posts
      .map((p) => `[${whyNot(p.text, p.author.headline) || `KEEP ${fitScore(p.text, p.author.headline)}`}] ${p.author.name} | ${cut(p.author.headline, 70)} | ${cut(p.text.replace(/\s+/g, " "), 90)}`)
      .join("\n");
  },
});

/** People waiting to be let in, oldest first. */
export const waiting = internalQuery({
  args: {},
  returns: v.array(v.object({ email: v.string(), name: v.optional(v.string()), role: v.optional(v.string()), linkedin: v.optional(v.string()) })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", false)).take(200);
    return rows.filter((r) => !r.rejected).map((r) => ({ email: r.email, name: r.name, role: r.role, linkedin: r.linkedin }));
  },
});

/**
 * The owner's one morning email (9:15 IST): who's waiting to be let in, today's LinkedIn post, the strongest
 * open-to-work people, and any errors since yesterday. Each part is left out when empty; nothing at all, no email.
 * `dryRun` returns the email instead of sending it, and doesn't mark anything as sent.
 */
export const sendMorning = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { dryRun }): Promise<string> => {
    const owner = ownerEmail();
    if (!emailOn() || !owner) return "Email or owner missing.";
    const now = Date.now();
    // One section failing mustn't stop the whole email: it's how the owner hears about failures.
    let postError = "";
    const [waitingList, post, seekers, errors, facts, services] = await Promise.all([
      ctx.runQuery(internal.growth.waiting, {}),
      jobsPostSection(ctx).catch((err) => {
        postError = String(err);
        return null;
      }),
      pickSeekers(ctx).catch((err) => `failed: ${String(err)}`),
      ctx.runQuery(internal.errors.unsent, {}),
      ctx.runQuery(internal.stats.healthFacts, { now }),
      ctx.runAction(internal.serviceCheck.section, {}).catch((err) => ({ text: `SERVICES\nWARNING: the service check itself failed: ${cut(String(err), 200)}`, alarm: true })),
    ]);
    const picked = typeof seekers === "string" ? [] : seekers.picked;
    const health = healthSection(facts, now, AUTOPILOT_SCORES);
    const parts: string[] = [health.text, services.text];
    if (waitingList.length) {
      parts.push(`WAITING TO BE LET IN (${waitingList.length}): ${appUrl()}/admin
${waitingList.map((w) => `- ${w.name || "(no name yet)"}, ${w.role || "role not given"} · ${w.email}${w.linkedin ? ` · ${w.linkedin}` : ""}`).join("\n")}`);
    }
    if (post) parts.push(post);
    if (picked.length) {
      // A personal comment per person, written from their post; the plain one if that fails.
      const written: { comments: (string | null)[]; error?: string } = await ctx.runAction(internal.growthNotes.write, {
        people: picked.map((p) => ({ name: p.author.name, headline: p.author.headline, post: p.text })),
      });
      parts.push(seekersSection(picked, written.comments, written.error));
    }
    if (errors.length) {
      parts.push(`ERRORS SINCE YESTERDAY (${errors.length}): ${appUrl()}/admin
${errors.slice(0, 5).map((r) => `- ${new Date(r._creationTime).toISOString().slice(0, 16).replace("T", " ")} UTC · ${r.email || "signed out"} · ${r.page}\n  ${cut(r.message.split("\n")[0], 200)}`).join("\n")}`);
    }
    if (typeof seekers === "string") parts.push(`(Open-to-work search: ${seekers})`);
    if (postError) parts.push(`(LinkedIn post failed: ${cut(postError, 200)})`);
    const bits = [(health.alarm || services.alarm) && "NEEDS A LOOK", health.headline, waitingList.length && `${waitingList.length} waiting`, post && "LinkedIn post", picked.length && `${picked.length} to comment on`, errors.length && `${errors.length} error${errors.length === 1 ? "" : "s"}`].filter(Boolean);
    const subject = `JobPipe this morning: ${bits.join(", ")}`;
    const text = `${parts.join("\n\n\n")}\n`;
    if (dryRun) return `${subject}\n\n${text}`;
    await sendEmail({ to: owner, subject, text });
    if (picked.length) await ctx.runMutation(internal.growth.markSeekersSent, { keys: picked.map(keyOf) });
    if (errors.length) await ctx.runMutation(internal.errors.markSent, { ids: errors.map((r) => r._id) });
    return `Sent: ${subject}`;
  },
});

/** People let in 21+ days ago who used JobPipe but never answered the day-12 pop-up, and haven't had this email. */
export const needFeedbackAsk = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ accessId: v.id("access"), email: v.string(), name: v.optional(v.string()) })),
  handler: async (ctx, { now }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      if (row.feedbackAskedAt || !row.email || isOwnerEmail(row.email)) continue;
      if (!row.decidedAt || now - row.decidedAt < 21 * DAY) continue;
      // Never used it: the setup nudge covers them, not a feedback ask.
      if (!(await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", row.userId)).first())) continue;
      const answered = await ctx.db
        .query("surveyAnswers")
        .withIndex("by_userId_and_kind_and_round", (q) => q.eq("userId", row.userId).eq("kind", "recommend").eq("round", 0))
        .first();
      if (answered && !answered.skipped) continue;
      out.push({ accessId: row._id, email: row.email, name: row.name });
    }
    return out;
  },
});

export const markFeedbackAsked = internalMutation({
  args: { accessId: v.id("access") },
  returns: v.null(),
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { feedbackAskedAt: Date.now() });
    return null;
  },
});

export const sendFeedbackAsks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!emailOn()) return null;
    const people = await ctx.runQuery(internal.growth.needFeedbackAsk, { now: Date.now() });
    for (const p of people) {
      try {
        await sendEmail({ to: p.email, ...feedbackEmail(p) });
        await ctx.runMutation(internal.growth.markFeedbackAsked, { accessId: p.accessId });
      } catch (err) {
        // One bad address doesn't stop the rest; it is tried again tomorrow.
        console.warn("Feedback ask failed for", p.email, String(err));
      }
    }
    return null;
  },
});

/**
 * Everyone let in who hasn't finished setup, with how far they got, for the owner to write to by hand.
 * Read-only: npx convex run --prod growth:notSetUp
 */
export const notSetUp = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out = [];
    for (const row of rows) {
      if (!row.email || isOwnerEmail(row.email)) continue;
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
      if (profile?.onboarded) continue;
      const cv = await ctx.db.query("resumes").withIndex("by_userId", (q) => q.eq("userId", row.userId)).first();
      const roles = await ctx.db.query("tracks").withIndex("by_userId_and_key", (q) => q.eq("userId", row.userId)).take(5);
      const days = (t?: number) => (t ? Math.floor((now - t) / DAY) : null);
      out.push({
        name: row.name ?? "",
        email: row.email,
        waitlistRole: row.role ?? "",
        linkedin: row.linkedin ?? "",
        partner: row.partner?.name ?? "",
        daysSinceLetIn: days(row.decidedAt),
        lastSeenDaysAgo: days(profile?.lastSeenAt),
        hasCv: !!cv,
        roles: roles.map((t) => t.name),
        nudges: [row.setupNudgeAt && "first", row.setupNudge2At && "second"].filter(Boolean),
      });
    }
    return out.sort((a, b) => (a.daysSinceLetIn ?? 0) - (b.daysSinceLetIn ?? 0));
  },
});

const noteV = v.object({ email: v.string(), subject: v.string(), text: v.string(), button: v.optional(v.string()) });

/**
 * The owner's hand-written notes, sent one at a time from `startAt`, `gapMinutes` apart.
 * The notes ride in the arguments, never in the code: npx convex run --prod growth:scheduleNotes "$(cat notes.json)"
 */
export const scheduleNotes = internalMutation({
  args: { notes: v.array(noteV), startAt: v.number(), gapMinutes: v.number() },
  handler: async (ctx, { notes, startAt, gapMinutes }) => {
    const wait = Math.max(0, startAt - Date.now());
    for (const [i, note] of notes.entries()) await ctx.scheduler.runAfter(wait + i * gapMinutes * 60_000, internal.growth.sendNote, note);
    return { scheduled: notes.length, first: new Date(Date.now() + wait).toISOString(), last: new Date(Date.now() + wait + (notes.length - 1) * gapMinutes * 60_000).toISOString() };
  },
});

/** True when this email's person has finished setup since the note was written. */
export const setUpNow = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const row = rows.find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (!row) return false;
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
    return !!profile?.onboarded;
  },
});

/** One hand-written note, skipped when the person finished setup in the meantime. */
export const sendNote = internalAction({
  args: noteV,
  handler: async (ctx, note) => {
    if (await ctx.runQuery(internal.growth.setUpNow, { email: note.email })) {
      console.log("Note skipped, already set up:", note.email);
      return null;
    }
    // The button signs them in with their email filled in, like the welcome email's link.
    const button = note.button ? { label: note.button, url: `${appUrl()}/?signin=1&email=${encodeURIComponent(note.email)}` } : undefined;
    await sendEmail({ to: note.email, subject: note.subject, ...noteEmail(note.text, button) });
    console.log("Note sent:", note.email);
    return null;
  },
});

/** Cancels every hand-written note still waiting to go, so they can be rewritten and scheduled again. */
export const cancelNotes = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Newest first: the notes were scheduled recently, behind weeks of finished morning runs.
    const waiting = await ctx.db.system.query("_scheduled_functions").order("desc").take(2000);
    let cancelled = 0;
    for (const job of waiting) {
      if (job.name.includes("sendNote") && job.state.kind === "pending") {
        await ctx.scheduler.cancel(job._id);
        cancelled++;
      }
    }
    return { cancelled };
  },
});
