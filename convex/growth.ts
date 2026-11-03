// Free growth on autopilot. Each morning the owner gets a ready LinkedIn post of new sales jobs; each Monday,
// a post about sales roles that keep getting reposted; and anyone let in who hasn't finished setup gets one nudge.
// The posts never name where the jobs come from.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { roleKey } from "./lib/company";
import { searchPosts } from "./lib/apify";
import { appUrl, emailOn, feedbackEmail, sendEmail, setupNudgeEmail } from "./lib/email";
import { backOffice, SALES_ROLES, titleMatches } from "./lib/salesRoles";

const DAY = 86_400_000;
const ALL_TITLES = [...new Set(SALES_ROLES.flatMap((r) => r.titles))];

/** A sales job by its title, leaving out finance roles that only borrow sales words. */
export function isSalesTitle(title: string) {
  return !backOffice(title) && ALL_TITLES.some((t) => titleMatches(t, title));
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

/** Sales roles in India that appeared on careers boards in the last day, one or two per company. */
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
      // A board seen for the first time brings old roles too; keep only ones posted in the last week.
      // No date means it could be months old, and the post says "new", so leave it out.
      const posted = j.postedAt ? Date.parse(j.postedAt) : NaN;
      if (Number.isNaN(posted) || posted < now - 7 * DAY) continue;
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

/** Emails the owner today's new sales jobs as a LinkedIn post ready to copy, with the links kept for replies. */
export const sendJobsPost = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const owner = ownerEmail();
    if (!emailOn() || !owner) return null;
    const jobs = (await ctx.runQuery(internal.growth.newSalesJobs, { now: Date.now() })).slice(0, 15);
    // Too few to be worth a post: skip today rather than post something thin.
    if (jobs.length < 3) return null;
    // Each job with its apply link right under it, so the post is ready to paste as is.
    const post = `${jobs.length} new sales jobs in India, posted in the last day 👇

${jobs.map((j) => `• ${j.company}, ${j.title} (${j.where})\n${j.url}`).join("\n\n")}

I find these every morning with JobPipe, the tool I built for my own sales job hunt. It also scores each role against your CV and tailors the CV for you: https://jobpipe.in

${TAGS}`;
    await sendEmail({
      to: owner,
      subject: `Today's LinkedIn post: ${jobs.length} new sales jobs`,
      text: `Copy everything between the lines into LinkedIn. The links are already in.

------------
${post}
------------

Tip: post between 8 and 10 am and reply to every comment in the first hour; that is when LinkedIn decides how far a post goes.

${appUrl()}/admin`,
    });
    return null;
  },
});

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
    return null;
  },
});

// Searches for sales people in India saying they're looking for work. Five searches, ten posts each: about $0.10 a day.
const OPEN_TO_WORK_SEARCHES = [
  "open to work SDR BDR India",
  "open to work account executive India SaaS",
  "open to work GTM go-to-market India",
  "open to work sales manager Bengaluru SaaS",
  "laid off sales B2B India looking for next role",
];
// The author talking about their own search ("I'm looking", "open to work"), not advice to people who are looking.
const LOOKING = /open to work|#opentowork|\bi(['’]m| am)( now| currently)? (actively )?(looking|seeking|exploring|open|available)|\bi (was|got) (laid off|let go|impacted)|\bmy (next|new) (role|opportunit|chapter)|\bimmediate joiner/i;
// Hiring posts say "looking for" too: "We're looking for an SDR". Those are recruiters, not job seekers.
// LinkedIn often uses curly apostrophes ("We’re hiring"), so both kinds are matched.
const HIRING = /we(['’]| a)re (hiring|looking|growing)|we are hiring|i(['’]| a)m hiring|i am hiring|#hiring|join (our|my|the) team|hiring (for|an?)\b|now hiring|apply (now|here|via|at)|dm me your (cv|resume)|send (your|me your) (cv|resume)|open (role|position)s?\b|is hiring|role sits/i;
// Recruiters and hiring managers post about roles; they aren't the people JobPipe is for.
const RECRUITER = /recruit|talent acquisition|sourcer|\bhr\b|human resources|hiring manager/i;
/** A sales person saying they're looking for work, not someone hiring for a role. */
export function isSeekerPost(text: string, headline: string) {
  const all = `${text} ${headline}`;
  // JobPipe's jobs are in India, so people elsewhere can't use it yet.
  return LOOKING.test(text) && !HIRING.test(text) && !RECRUITER.test(headline) && SALES.test(headline) && !NOT_OUR_SALES.test(all) && INDIA.test(all);
}
const INDIA = /india|bengaluru|bangalore|mumbai|delhi|gurugram|gurgaon|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|kochi/i;
// Sales and GTM roles JobPipe finds jobs for, read from the person's own headline so a passing mention doesn't count.
const SALES = /\b(sdr|bdr|sales development|business development (rep|representative|manager|executive)|account executive|\bae\b|inside sales|enterprise sales|sales (manager|leader|director|head|lead)|head of sales|vp,? sales|chief revenue|cro\b|gtm|go-to-market|revenue operations|revops|key account manager|account manager|partnerships? manager)/i;
// Field and consumer sales are a different job market from the B2B and SaaS roles JobPipe covers.
const NOT_OUR_SALES = /\b(area sales|regional sales|territory|asm\b|rsm\b|retail|insurance|real estate|pharma|medical rep|fmcg|solar|channel sales|dealer|distributor|banking sales|loan|admissions?|test prep)/i;

/** A short note for someone looking for a sales job: under LinkedIn's 300-character connect-note limit. */
export function pitch(name: string) {
  const word = name.trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") ?? "";
  // "PRAASHANT" reads as shouting: write it "Praashant".
  const first = word ? word[0].toUpperCase() + (word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1)) : "there";
  return `Hi ${first}, saw your post. I built JobPipe for sales people job hunting in India: new sales roles every morning, each scored against your CV, and a tailored CV in a click. First week is free: https://jobpipe.in. Happy to help either way.`;
}

/**
 * Each morning: LinkedIn posts from the last day by sales people looking for work, emailed to the owner to comment on
 * by hand. Never comments or messages on its own: LinkedIn bans accounts for that.
 */
export const sendCommentList = internalAction({
  args: {},
  // Says what happened, so a run by hand shows why no email came.
  returns: v.string(),
  handler: async () => {
    const owner = ownerEmail();
    if (!emailOn() || !owner || !env.APIFY_TOKEN) return `Off: email ${emailOn() ? "on" : "off"}, owner ${owner ? "set" : "missing"}, Apify ${env.APIFY_TOKEN ? "set" : "missing"}.`;
    let posts;
    try {
      posts = await searchPosts(OPEN_TO_WORK_SEARCHES, 10, "24h");
    } catch (err) {
      console.warn("Open-to-work search failed", String(err));
      return `Search failed: ${String(err)}`;
    }
    const picked = posts
      .filter((p) => p.url && isSeekerPost(p.text, p.author.headline))
      .slice(0, 10);
    if (!picked.length) return `Found ${posts.length} posts, none from sales people looking for work. No email sent.`;
    const snippet = (t: string) => {
      const one = t.replace(/\s+/g, " ").trim();
      return one.length > 220 ? `${one.slice(0, 220)}…` : one;
    };
    await sendEmail({
      to: owner,
      subject: `${picked.length} sales people looking for work today: worth a comment`,
      text: `Posts from the last day by sales people looking for a job. 10 to 15 minutes of real comments here builds your name with exactly the people JobPipe is for.

How to use it:
- Comment on the post with one specific tip for their situation, so your name is familiar.
- Then send the message below (connect note or DM). It's ready to paste; change a word if something in their post fits.
- Do it from your own account, by hand. Never automate this part: LinkedIn bans accounts for it.

${picked
  .map((p, i) => `${i + 1}. ${p.author.name}${p.author.headline ? `, ${p.author.headline.slice(0, 90)}` : ""}
   "${snippet(p.text)}"
   Post: ${p.url}${p.author.url ? `\n   Profile: ${p.author.url}` : ""}
   Message:
   ${pitch(p.author.name)}`)
  .join("\n\n")}

${appUrl()}/admin`,
    });
    return `Found ${posts.length} posts, emailed ${picked.length} to ${owner}.`;
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
