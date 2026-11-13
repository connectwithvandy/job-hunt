import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { boardFromUrl } from "./lib/boardFromUrl";
import { CAREER_BOARDS, type CareerBoard } from "./lib/careerBoards";
import { companyKey, roleKey } from "./lib/company";
import { fullTitle } from "./lib/salesRoles";

// Discovered boards are capped so the morning download stays a few minutes long.
// Each one is read every morning; 2,500 keeps the morning read inside its time.
const MAX_DISCOVERED = 2500;

export const atsV = v.union(v.literal("ashby"), v.literal("greenhouse"), v.literal("lever"), v.literal("workday"), v.literal("keka"), v.literal("zoho"), v.literal("freshteam"), v.literal("smartrecruiters"), v.literal("rippling"), v.literal("google"), v.literal("workable"), v.literal("recruitee"), v.literal("teamtailor"), v.literal("bamboohr"));

async function saveBoard(ctx: MutationCtx, company: string, board: { ats: CareerBoard["ats"]; slug: string }) {
  // Roles are filed by company name, so one board per name.
  const key = companyKey(company);
  if (!key || CAREER_BOARDS.some((b) => (b.ats === board.ats && b.slug === board.slug) || companyKey(b.name) === key)) return;
  const seen =
    (await ctx.db.query("discoveredBoards").withIndex("by_ats_and_slug", (q) => q.eq("ats", board.ats).eq("slug", board.slug)).first()) ??
    (await ctx.db.query("discoveredBoards").withIndex("by_key", (q) => q.eq("key", key)).first());
  if (seen) return;
  if ((await ctx.db.query("discoveredBoards").take(MAX_DISCOVERED)).length >= MAX_DISCOVERED) return;
  await ctx.db.insert("discoveredBoards", { key, name: company.trim(), ...board });
}

/** Remembers the careers board behind a job's links, so tomorrow's download reads that company too. */
export async function noteBoard(ctx: MutationCtx, company: string, links: (string | undefined)[]) {
  const board = links.map(boardFromUrl).find(Boolean);
  if (board && company.trim()) await saveBoard(ctx, company, board);
}

/** Of these companies, the ones not looked up in the last month. */
export const unchecked = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const monthAgo = Date.now() - 30 * 86_400_000;
    const out: string[] = [];
    for (const key of keys) {
      const c = await ctx.db.query("boardChecks").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (!c || c.checkedAt < monthAgo) out.push(key);
    }
    return out;
  },
});

/** Records a finder pass: which companies were looked up, and the boards found. */
export const recordFinds = internalMutation({
  args: { checked: v.array(v.string()), found: v.array(v.object({ name: v.string(), ats: atsV, slug: v.string() })) },
  handler: async (ctx, { checked, found }) => {
    for (const key of checked) {
      const c = await ctx.db.query("boardChecks").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (c) await ctx.db.patch("boardChecks", c._id, { checkedAt: Date.now() });
      else await ctx.db.insert("boardChecks", { key, checkedAt: Date.now() });
    }
    for (const f of found) await saveBoard(ctx, f.name, f);
    return null;
  },
});

/** Startups people have gathered on the Companies page (YC, recently funded, dream lists). */
export const prospectCompanies = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("prospects").take(5000);
    return [...new Map(rows.map((r) => [r.key, { name: r.name, website: r.website }])).values()];
  },
});

export const discovered = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("discoveredBoards").take(MAX_DISCOVERED)).map(({ name, ats, slug }) => ({ name, website: "", ats, slug })),
});

/** The board for a company in someone's dream list, if we read one. */
export const boardByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const b = CAREER_BOARDS.find((x) => companyKey(x.name) === key);
    if (b) return b.name;
    return (await ctx.db.query("discoveredBoards").withIndex("by_key", (q) => q.eq("key", key)).first())?.name ?? null;
  },
});

/** Finds boards in jobs already saved. Run once: npx convex run careers:discoverFromJobs */
export const discoverFromJobs = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("jobs").paginate({ numItems: 200, cursor: cursor ?? null });
    for (const j of page.page) await noteBoard(ctx, j.company, [j.sourceUrl, j.url]);
    // Carries on through the rest of the jobs by itself.
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.careers.discoverFromJobs, { cursor: page.continueCursor });
    return null;
  },
});

const careerJobV = v.object({
  externalId: v.string(),
  company: v.string(),
  title: v.string(),
  location: v.string(),
  workSetting: v.optional(v.string()),
  salary: v.optional(v.string()),
  postedAt: v.optional(v.string()),
  url: v.string(),
  india: v.boolean(),
  description: v.optional(v.string()),
});

/** Starts the id of a role saved from the shared LinkedIn search. These stay inside the app, off the public guide pages. */
const LINKEDIN_ROLE = "linkedin:";

/** Roles from the shared LinkedIn search saved before this time, oldest first. */
export const oldLinkedIn = internalQuery({
  args: { before: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, { before }) => {
    const rows = await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.gte("externalId", LINKEDIN_ROLE).lt("externalId", "linkedin;")).take(1000);
    return rows.filter((r) => r._creationTime < before).map((r) => r.externalId);
  },
});

/** Every title in anyone's tracks, typed or picked. Only roles matching one are kept. */
/** Every fast board's last fingerprint. */
export const boardHashes = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("boardStates").take(1000)).map(({ key, hash }) => ({ key, hash })),
});

export const saveBoardHashes = internalMutation({
  args: { rows: v.array(v.object({ key: v.string(), hash: v.string() })) },
  handler: async (ctx, { rows }) => {
    for (const { key, hash } of rows) {
      const have = await ctx.db.query("boardStates").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (have) await ctx.db.patch("boardStates", have._id, { hash });
      else await ctx.db.insert("boardStates", { key, hash });
    }
    return null;
  },
});

/** Roles saved since a time, newest first: what a daytime read of the boards just found. */
export const newSince = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const out = [];
    for await (const r of ctx.db.query("careerJobs").order("desc")) {
      if (r._creationTime < since || out.length >= 300) break;
      out.push({ externalId: r.externalId, company: r.company, title: r.title, location: r.location, workSetting: r.workSetting, salary: r.salary, postedAt: r.postedAt, url: r.url, india: r.india });
    }
    return out;
  },
});

export const trackTitles = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tracks = await ctx.db.query("tracks").take(2000);
    return [...new Set(tracks.flatMap((t) => t.titles.map((x) => x.trim().toLowerCase())).filter(Boolean))];
  },
});

/** Each saved role's id and link, so a refresh can spot links the board has moved. */
export const linksFor = internalQuery({
  args: { company: v.string() },
  handler: async (ctx, { company }) => {
    const rows = await ctx.db.query("careerJobs").withIndex("by_company", (q) => q.eq("company", company)).take(3000);
    // Roles from the shared LinkedIn search aren't on the company's board list, so a board refresh must not close them.
    return rows.filter((r) => !r.externalId.startsWith(LINKEDIN_ROLE)).map((r) => ({ externalId: r.externalId, url: r.url }));
  },
});

async function sightingOf(ctx: MutationCtx, key: string) {
  return await ctx.db.query("roleSightings").withIndex("by_key", (q) => q.eq("key", key)).first();
}

export const addJobs = internalMutation({
  args: { jobs: v.array(careerJobV) },
  handler: async (ctx, { jobs }) => {
    for (const { description, ...job } of jobs) {
      const have = await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.eq("externalId", job.externalId)).first();
      if (have) {
        // The board moved its links (like Cursor leaving Ashby's hosted page): keep ours pointing somewhere real.
        if (have.url !== job.url) await ctx.db.patch("careerJobs", have._id, { url: job.url });
        continue;
      }
      await ctx.db.insert("careerJobs", job);
      // A LinkedIn role's apply link often opens the company's own board: read that board every morning from now on.
      if (job.externalId.startsWith("linkedin:")) await noteBoard(ctx, job.company, [job.url]);
      if (description) await ctx.db.insert("careerJobTexts", { externalId: job.externalId, description });
      // The same title back after it was taken down is a repost.
      const key = roleKey(job.company, job.title);
      const seen = await sightingOf(ctx, key);
      if (!seen) await ctx.db.insert("roleSightings", { key, firstSeen: Date.now(), reposts: 0 });
      else if (seen.lastClosedAt) await ctx.db.patch("roleSightings", seen._id, { reposts: seen.reposts + 1, lastClosedAt: undefined });
    }
    return null;
  },
});

/** Removes roles the company has taken down. */
export const removeJobs = internalMutation({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, { externalIds }) => {
    for (const externalId of externalIds) {
      const job = await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first();
      if (job) {
        const key = roleKey(job.company, job.title);
        const seen = await sightingOf(ctx, key);
        if (seen) await ctx.db.patch("roleSightings", seen._id, { lastClosedAt: Date.now() });
        else await ctx.db.insert("roleSightings", { key, firstSeen: job._creationTime, reposts: 0, lastClosedAt: Date.now() });
        await ctx.db.delete("careerJobs", job._id);
      }
      const text = await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first();
      if (text) await ctx.db.delete("careerJobTexts", text._id);
    }
    return null;
  },
});

const RANK_WORDS = new Set(["manager", "head", "of", "director", "lead", "leader", "team", "senior", "representative", "vice", "president", "chief"]);

type CareerRow = { externalId: string; company: string; title: string; location: string; workSetting?: string; salary?: string; postedAt?: string; url: string; india: boolean };

/** Careers-board roles whose titles best match any of these, closest first. Callers check the exact words and the place. */
async function searchTitles(ctx: QueryCtx, titles: string[], india: boolean, perTerm: number) {
  const seen = new Map<string, CareerRow>();
  // Each title as written, written out ("SDR" as "sales development"), and without its rank words, so
  // "SDR Manager" also reaches "Head of Sales Development".
  const terms = new Set(titles.flatMap((t) => {
    const full = fullTitle(t);
    return [t, full, full.split(" ").filter((w) => !RANK_WORDS.has(w)).join(" ")];
  }).filter((t) => t.trim()));
  for (const term of terms) {
    const rows = await ctx.db.query("careerJobs").withSearchIndex("search_title", (q) => (india ? q.search("title", term).eq("india", true) : q.search("title", term)))
      .take(perTerm);
    for (const { _id, _creationTime, ...r } of rows) seen.set(r.externalId, r);
  }
  return [...seen.values()];
}

export const search = internalQuery({
  args: { titles: v.array(v.string()), india: v.boolean() },
  handler: async (ctx, { titles, india }) => await searchTitles(ctx, titles.slice(0, 16), india, 64),
});

/**
 * Open roles for a public sales-jobs guide page. These are public postings from company careers boards, and the
 * page rebuilds at most once a day, so the read stays small: a few titles, 96 rows per search word. 96, not fewer,
 * because loose matches ("Sales Executives" for "Account Executive") fill the top of a search and the page drops them.
 */
export const forGuide = query({
  args: { titles: v.array(v.string()), india: v.boolean() },
  handler: async (ctx, { titles, india }) => {
    const rows = await searchTitles(ctx, titles.slice(0, 4).map((t) => t.slice(0, 60)), india, 96);
    return rows
      .filter((r) => !r.externalId.startsWith(LINKEDIN_ROLE))
      .map(({ externalId, company, title, location, workSetting, postedAt, url }) => ({ externalId, company, title, location, workSetting, postedAt, url }));
  },
});

/** One open role's full text, for its public page. Null once the company takes it down, so the page goes away. */
export const forJobPage = query({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    const job = await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first();
    if (!job) return null;
    const text = await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first();
    return { description: text?.description ?? null };
  },
});

/** Whether a careers-board role is still on the company's board, as of this morning's download. */
export const isListed = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => !!(await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first()),
});

export const forCompany = internalQuery({
  args: { company: v.string() },
  handler: async (ctx, { company }) => {
    const rows = await ctx.db.query("careerJobs").withIndex("by_company", (q) => q.eq("company", company)).take(3000);
    return rows.map(({ _id, _creationTime, ...r }) => r);
  },
});

export const texts = internalQuery({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, { externalIds }) => {
    const out: { externalId: string; description: string }[] = [];
    for (const externalId of externalIds.slice(0, 100)) {
      const t = await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first();
      if (t) out.push({ externalId, description: t.description });
    }
    return out;
  },
});
