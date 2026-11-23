import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { boardFromUrl } from "./lib/boardFromUrl";
import { CAREER_BOARDS, type CareerBoard } from "./lib/careerBoards";
import { companyKey, roleKey } from "./lib/company";
import { SEED_BOARDS } from "./lib/seedBoards";
import { fullTitle } from "./lib/salesRoles";

// Discovered boards are capped so the morning download stays a few minutes long.
// Each one is read every morning; 2,500 keeps the morning read inside its time. Found Workday boards aren't read
// and don't count (careers.discovered).
const MAX_DISCOVERED = 2500;

export const atsV = v.union(v.literal("ashby"), v.literal("greenhouse"), v.literal("lever"), v.literal("workday"), v.literal("keka"), v.literal("zoho"), v.literal("freshteam"), v.literal("smartrecruiters"), v.literal("rippling"), v.literal("google"), v.literal("workable"), v.literal("recruitee"), v.literal("teamtailor"), v.literal("bamboohr"), v.literal("eightfold"), v.literal("recruiterbox"));

async function saveBoard(ctx: MutationCtx, company: string, board: { ats: CareerBoard["ats"]; slug: string }) {
  // Roles are filed by company name, so one board per name.
  const key = companyKey(company);
  if (!key || CAREER_BOARDS.some((b) => (b.ats === board.ats && b.slug === board.slug) || companyKey(b.name) === key)) return false;
  const seen =
    (await ctx.db.query("discoveredBoards").withIndex("by_ats_and_slug", (q) => q.eq("ats", board.ats).eq("slug", board.slug)).first()) ??
    (await ctx.db.query("discoveredBoards").withIndex("by_key", (q) => q.eq("key", key)).first());
  if (seen) return false;
  // No count of all boards here: it read every board for each saved job, and on 13 Nov (past 1,000 boards) that broke
  // the morning save for 22 people. The morning read takes the first MAX_DISCOVERED; the table only grows by real boards.
  await ctx.db.insert("discoveredBoards", { key, name: company.trim(), ...board });
  return true;
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

/**
 * Saves the checked list of boards with India or remote sales roles (lib/seedBoards.ts) to the boards read each
 * morning. Boards already saved are skipped, so it's safe to run again. The weekly finder runs it too.
 * npx convex run --prod careers:addSeedBoards
 */
export const addSeedBoards = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let added = 0;
    for (const b of SEED_BOARDS) if (await saveBoard(ctx, b.name, b)) added++;
    return added;
  },
});

/** Hand-picked companies whose careers page moved, and where to (careersRefresh.heal). */
export const moves = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("boardMoves").take(500)).map(({ name, ats, slug }) => ({ name, ats, slug })),
});

/** Records where a hand-picked company's careers page moved to; replaces any earlier move. */
export const saveMove = internalMutation({
  args: { name: v.string(), ats: atsV, slug: v.string() },
  handler: async (ctx, { name, ats, slug }) => {
    const old = await ctx.db.query("boardMoves").withIndex("by_name", (q) => q.eq("name", name)).first();
    if (old) await ctx.db.patch("boardMoves", old._id, { ats, slug, movedAt: Date.now() });
    else await ctx.db.insert("boardMoves", { name, ats, slug, movedAt: Date.now() });
    return null;
  },
});

/** Startups people have gathered on the Dream companies page (YC, recently funded, dream lists). */
export const prospectCompanies = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("prospects").take(5000);
    return [...new Map(rows.map((r) => [r.key, { name: r.name, website: r.website }])).values()];
  },
});

// The weekly finder's extra sources (19 Nov 2026). Each read is small and paged, so none nears the read limit.

/** One page of members' LinkedIn connections' companies (people marked "left" don't count). */
export const connectionCompanyPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ names: v.array(v.string()), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("contacts").paginate({ numItems: 4000, cursor });
    return { names: page.page.filter((c) => !c.left).map((c) => c.company), cursor: page.continueCursor, isDone: page.isDone };
  },
});

/** Companies behind the paid LinkedIn and Google jobs: with a board of their own, all their roles come free. */
export const poolCompanies = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const names: string[] = [];
    // ";" sorts right after ":", so this reads exactly the ids starting with each prefix.
    for (const p of POOLED) {
      const end = `${p.slice(0, -1)};`;
      const rows = await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.gte("externalId", p).lt("externalId", end)).take(3000);
      names.push(...rows.map((r) => r.company));
    }
    return names;
  },
});

/** Companies one member is applying to or hearing from: others in sales will want those roles too. */
export const appliedCompanies = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.string()),
  handler: async (ctx, { userId }) => {
    const names: string[] = [];
    for (const status of ["applying", "applied", "screening", "interview", "offer"] as const) {
      const rows = await ctx.db.query("jobs").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status)).take(100);
      names.push(...rows.filter((j) => j.source !== "careers").map((j) => j.company));
    }
    return names;
  },
});

/** Member ids, for reading their applications one person at a time. */
export const memberIds = internalQuery({
  args: {},
  returns: v.array(v.id("users")),
  handler: async (ctx) => (await ctx.db.query("users").take(2000)).map((u) => u._id),
});

/** Company keys that already have a board we read, so the finder doesn't look them up again. */
export const boardKeys = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => [
    ...CAREER_BOARDS.map((b) => companyKey(b.name)),
    ...(await ctx.db.query("discoveredBoards").take(5000)).map((b) => b.key),
  ],
});

export const discovered = internalQuery({
  args: {},
  handler: async (ctx) => {
    // A company found from job links and later hand-picked is read once, as the hand-picked board.
    const picked = new Set(CAREER_BOARDS.flatMap((b) => [`${b.ats}:${b.slug}`, companyKey(b.name)]));
    const out: CareerBoard[] = [];
    // Found Workday boards are left out and don't count toward the cap: since 17 Nov only the hand-picked
    // Workday companies are read (owner: SaaS only). Until 23 Nov their 563 rows took up room in the first 2,500,
    // so the read list was really ~1,760 boards and would have stopped growing within weeks.
    for await (const b of ctx.db.query("discoveredBoards")) {
      if (b.ats === "workday" || picked.has(`${b.ats}:${b.slug}`) || picked.has(b.key)) continue;
      out.push({ name: b.name, website: "", ats: b.ats, slug: b.slug });
      if (out.length >= MAX_DISCOVERED) break;
    }
    return out;
  },
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
/** Roles from the shared daily searches (LinkedIn, Google Jobs): not on any careers board, so a board refresh leaves them alone. */
const POOLED = [LINKEDIN_ROLE, "gjobs:"];

/**
 * One page of the shared LinkedIn or Google Jobs roles saved before `before`, to take out after a month.
 * Paged, not the first 1,000: ids sort by LinkedIn's number, not by age, and with 2,300+ LinkedIn roles (23 Nov)
 * the old ones past the first 1,000 would never have been taken out.
 */
export const oldPooledPage = internalQuery({
  args: { prefix: v.union(v.literal("linkedin:"), v.literal("gjobs:")), before: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ ids: v.array(v.string()), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, { prefix, before, cursor }) => {
    // ";" sorts right after ":", so this reads exactly the ids starting with the prefix.
    const end = `${prefix.slice(0, -1)};`;
    const page = await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.gte("externalId", prefix).lt("externalId", end)).paginate({ numItems: 2000, cursor });
    return { ids: page.page.filter((r) => r._creationTime < before).map((r) => r.externalId), cursor: page.isDone ? null : page.continueCursor };
  },
});

/** One page of the careers-board roles (not LinkedIn or Google Jobs), slim, for the daily sweep. */
export const boardRowsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ rows: v.array(v.object({ externalId: v.string(), company: v.string() })), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("careerJobs").paginate({ numItems: 4000, cursor });
    return {
      rows: page.page.filter((r) => !POOLED.some((p) => r.externalId.startsWith(p))).map((r) => ({ externalId: r.externalId, company: r.company })),
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/** Notes that these companies' boards were just read without an error. At most one write per company every 20 hours (the sweep counts days). */
export const markRead = internalMutation({
  args: { names: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { names }) => {
    const now = Date.now();
    for (const name of names) {
      const have = await ctx.db.query("boardReads").withIndex("by_name", (q) => q.eq("name", name)).unique();
      if (!have) await ctx.db.insert("boardReads", { name, readAt: now });
      else if (now - have.readAt > 20 * 3_600_000) await ctx.db.patch("boardReads", have._id, { readAt: now });
    }
    return null;
  },
});

/**
 * Of these companies with roles in the shared list, the ones whose board is read every day (`listed`) but hasn't
 * answered for `staleDays`. A company seen here for the first time starts its count now, so nothing is taken
 * out on the day this check starts. Companies not listed are handled by the caller.
 */
export const staleReads = internalMutation({
  args: { names: v.array(v.string()), staleDays: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, { names, staleDays }) => {
    const now = Date.now();
    const out: string[] = [];
    for (const name of names) {
      const have = await ctx.db.query("boardReads").withIndex("by_name", (q) => q.eq("name", name)).unique();
      if (!have) await ctx.db.insert("boardReads", { name, readAt: now });
      else if (now - have.readAt > staleDays * 86_400_000) out.push(name);
    }
    return out;
  },
});

/** Every title in anyone's tracks, typed or picked. Only roles matching one are kept. */
/** Every fast board's last fingerprint. */
export const boardHashes = internalQuery({
  args: {},
  // Room for every board (up to 2,500 found + the hand-picked ones). At 1,000 the rest looked new every 15 minutes
  // and were saved again each time (17 Nov: ~940 fast boards). Rows are tiny: a key and a short hash.
  handler: async (ctx) => (await ctx.db.query("boardStates").take(MAX_DISCOVERED + 500)).map(({ key, hash }) => ({ key, hash })),
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
/**
 * Every India role, a page at a time, for matching in code. The title search hands back at most 64 per title,
 * and India alone had 150+ "Account Executive" roles (17 Nov), so most never reached anyone.
 */
export const indiaPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("careerJobs").withIndex("by_india", (q) => q.eq("india", true)).paginate({ cursor, numItems: 2000 });
    return {
      rows: page.page.map(({ externalId, company, title, location, workSetting, salary, postedAt, url, india }) => ({ externalId, company, title, location, workSetting, salary, postedAt, url, india })),
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const newSince = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const out = [];
    for await (const r of ctx.db.query("careerJobs").order("desc")) {
      if (r._creationTime < since || out.length >= 1000) break;
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
    // Roles from the shared LinkedIn and Google searches aren't on the company's board list, so a board refresh must not close them.
    return rows.filter((r) => !POOLED.some((p) => r.externalId.startsWith(p))).map((r) => ({ externalId: r.externalId, url: r.url }));
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
      if (POOLED.some((p) => job.externalId.startsWith(p))) await noteBoard(ctx, job.company, [job.url]);
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
  // perTerm: places outside India search the whole world list, so 64 a title left only a few roles for any one
  // country (18 Nov: 3 UAE sales roles out of 584 read). Those searches pass more.
  args: { titles: v.array(v.string()), india: v.boolean(), perTerm: v.optional(v.number()) },
  handler: async (ctx, { titles, india, perTerm = 64 }) => await searchTitles(ctx, titles.slice(0, 16), india, Math.min(perTerm, 1024)),
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

/** Which of these public roles are still on the company's board, so the sitemap can leave out ones taken down since the guides were last rebuilt. */
export const stillListed = query({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, { externalIds }) => {
    const out: string[] = [];
    for (const externalId of externalIds.slice(0, 400)) {
      const job = await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first();
      if (job) out.push(externalId);
    }
    return out;
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

/** The saved descriptions of these roles, for the fit guess. Roles without one are left out. */
export const textsFor = internalQuery({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, { externalIds }) => {
    const out: { externalId: string; description: string }[] = [];
    for (const id of externalIds.slice(0, 80)) {
      const t = await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", id)).first();
      if (t) out.push({ externalId: id, description: t.description });
    }
    return out;
  },
});

/** One page of the shared careers-board roles, slim, for reports and the hiring index. */
export const jobsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("careerJobs").paginate({ numItems: 2000, cursor });
    return {
      rows: page.page.map((r) => ({ externalId: r.externalId, company: r.company, title: r.title, location: r.location, workSetting: r.workSetting, salary: r.salary, url: r.url, india: r.india, at: r._creationTime })),
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/** Boards found by the finder or from job links, by careers system. */
export const discoveredCounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Every found board, Workday ones too, though only MAX_DISCOVERED of the others are read.
    const rows = await ctx.db.query("discoveredBoards").take(8000);
    const by: Record<string, number> = {};
    for (const r of rows) by[r.ats] = (by[r.ats] ?? 0) + 1;
    return { total: rows.length, byAts: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([ats, n]) => `${ats} ${n}`).join(", ") };
  },
});

/** How many times each of these roles was taken down and posted again (roleKey keys). */
export const repostsFor = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const out: { key: string; reposts: number; firstSeen: number }[] = [];
    for (const key of keys.slice(0, 1000)) {
      const s = await ctx.db.query("roleSightings").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (s) out.push({ key, reposts: s.reposts, firstSeen: s.firstSeen });
    }
    return out;
  },
});
