import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { boardFromUrl } from "./lib/boardFromUrl";
import { CAREER_BOARDS, type CareerBoard } from "./lib/careerBoards";
import { companyKey } from "./lib/company";

// Discovered boards are capped so the morning download stays a few minutes long.
const MAX_DISCOVERED = 1000;

const atsV = v.union(v.literal("ashby"), v.literal("greenhouse"), v.literal("lever"), v.literal("workday"), v.literal("keka"), v.literal("zoho"), v.literal("freshteam"));

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

/** Every title in anyone's tracks, typed or picked. Only roles matching one are kept. */
export const trackTitles = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tracks = await ctx.db.query("tracks").take(2000);
    return [...new Set(tracks.flatMap((t) => t.titles.map((x) => x.trim().toLowerCase())).filter(Boolean))];
  },
});

export const idsFor = internalQuery({
  args: { company: v.string() },
  handler: async (ctx, { company }) => {
    const rows = await ctx.db.query("careerJobs").withIndex("by_company", (q) => q.eq("company", company)).take(3000);
    return rows.map((r) => r.externalId);
  },
});

export const addJobs = internalMutation({
  args: { jobs: v.array(careerJobV) },
  handler: async (ctx, { jobs }) => {
    for (const { description, ...job } of jobs) {
      if (await ctx.db.query("careerJobs").withIndex("by_externalId", (q) => q.eq("externalId", job.externalId)).first()) continue;
      await ctx.db.insert("careerJobs", job);
      if (description) await ctx.db.insert("careerJobTexts", { externalId: job.externalId, description });
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
      if (job) await ctx.db.delete("careerJobs", job._id);
      const text = await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first();
      if (text) await ctx.db.delete("careerJobTexts", text._id);
    }
    return null;
  },
});

/** Roles whose titles best match any of these, closest first. The caller checks the exact words and the place. */
export const search = internalQuery({
  args: { titles: v.array(v.string()), india: v.boolean() },
  handler: async (ctx, { titles, india }) => {
    const seen = new Map<string, { externalId: string; company: string; title: string; location: string; workSetting?: string; salary?: string; postedAt?: string; url: string; india: boolean }>();
    for (const title of titles.slice(0, 16)) {
      const rows = await ctx.db.query("careerJobs").withSearchIndex("search_title", (q) => (india ? q.search("title", title).eq("india", true) : q.search("title", title)))
        .take(64);
      for (const { _id, _creationTime, ...r } of rows) seen.set(r.externalId, r);
    }
    return [...seen.values()];
  },
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
