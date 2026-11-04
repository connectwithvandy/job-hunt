// Free growth on autopilot. Each morning the owner gets one email (sendMorning): who's waiting, a ready LinkedIn post,
// the strongest open-to-work people and any errors. Each Monday,
// a post about sales roles that keep getting reposted; and anyone let in who hasn't finished setup gets one nudge.
// The posts never name where the jobs come from.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { type ActionCtx, env, internalAction, internalMutation, internalQuery } from "./_generated/server";
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

/** Today's LinkedIn post: the top new sales jobs with their links, ready to paste. Null when too few to post. */
async function jobsPostSection(ctx: ActionCtx): Promise<string | null> {
  const jobs = (await ctx.runQuery(internal.growth.newSalesJobs, { now: Date.now() })).slice(0, JOBS_PER_POST);
  // Too few to be worth a post: skip today rather than post something thin.
  if (jobs.length < 3) return null;
  // Each job with its apply link right under it, so the post is ready to paste as is.
  const post = `${jobs.length} new sales jobs in India, posted in the last day 👇

${jobs.map((j) => `• ${j.company}, ${j.title} (${j.where})\n${j.url}`).join("\n\n")}

I find these every morning with JobPipe, the tool I built for my own sales job hunt. It also scores each role against your CV and tailors the CV for you: https://jobpipe.in

${TAGS}`;
  return `LINKEDIN POST (copy everything between the lines; post before 10 am and reply to comments in the first hour)
------------
${post}
------------`;
}
const JOBS_PER_POST = 4;

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
const NOT_OUR_SALES = /\b(area sales|regional sales|territory|asm\b|rsm\b|retail|insurance|real estate|pharma|medical rep|fmcg|solar|channel sales|dealer|distributor|banking sales|loan|admissions?|test prep)/i;

/** A short note for someone looking for a sales job: under LinkedIn's 300-character connect-note limit. */
export function pitch(name: string) {
  const word = name.trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") ?? "";
  // "PRAASHANT" reads as shouting: write it "Praashant".
  const first = word ? word[0].toUpperCase() + (word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1)) : "there";
  return `Hi ${first}, saw your post. I built JobPipe for sales people job hunting: new sales roles every morning, each scored against your CV, and a tailored CV in a click. First week is free: https://jobpipe.in. Happy to help either way.`;
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

function seekersSection(picked: SeekerPost[]) {
  const snippet = (t: string) => cut(t.replace(/\s+/g, " ").trim(), 220);
  return `SALES PEOPLE LOOKING FOR WORK (about 5 minutes: comment with one useful tip, then send the message by hand; never automate this)

${picked
  .map((p, i) => `${i + 1}. ${p.author.name}${p.author.headline ? `, ${cut(p.author.headline, 90)}` : ""}
   "${snippet(p.text)}"
   Post: ${p.url}${p.author.url ? `\n   Profile: ${p.author.url}` : ""}
   Message:
   ${pitch(p.author.name)}`)
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
    const [waitingList, post, seekers, errors] = await Promise.all([
      ctx.runQuery(internal.growth.waiting, {}),
      jobsPostSection(ctx),
      pickSeekers(ctx),
      ctx.runQuery(internal.errors.unsent, {}),
    ]);
    const picked = typeof seekers === "string" ? [] : seekers.picked;
    const parts: string[] = [];
    if (waitingList.length) {
      parts.push(`WAITING TO BE LET IN (${waitingList.length}): ${appUrl()}/admin
${waitingList.map((w) => `- ${w.name || "(no name yet)"}, ${w.role || "role not given"} · ${w.email}${w.linkedin ? ` · ${w.linkedin}` : ""}`).join("\n")}`);
    }
    if (post) parts.push(post);
    if (picked.length) parts.push(seekersSection(picked));
    if (errors.length) {
      parts.push(`ERRORS SINCE YESTERDAY (${errors.length}): ${appUrl()}/admin
${errors.slice(0, 5).map((r) => `- ${new Date(r._creationTime).toISOString().slice(0, 16).replace("T", " ")} UTC · ${r.email || "signed out"} · ${r.page}\n  ${cut(r.message.split("\n")[0], 200)}`).join("\n")}`);
    }
    if (typeof seekers === "string") parts.push(`(Open-to-work search: ${seekers})`);
    if (!parts.length || (parts.length === 1 && typeof seekers === "string")) return "Nothing to report. No email sent.";
    const bits = [waitingList.length && `${waitingList.length} waiting`, post && "LinkedIn post", picked.length && `${picked.length} to message`, errors.length && `${errors.length} error${errors.length === 1 ? "" : "s"}`].filter(Boolean);
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
