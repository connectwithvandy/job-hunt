// One public page per open sales role in India and remote, from company careers boards (25 Nov 2026).
// Job searches are where people find JobPipe on Google; the guides listed only ~230 roles while thousands are open.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { AGGREGATORS, junkCompany, storeRetailJob } from "./lib/company";
import { CITIES, cityOf, publicRoleCode, publicRoleHref, slugify } from "./lib/publicRole";
import { isSalesTitle, postGroup } from "./growth";

const DAY = 86_400_000;
/** Older postings are usually filled or stale even when the board still lists them. */
const MAX_AGE_DAYS = 45;
/** A rebuild that finds far fewer roles than are listed means a bad board read: keep the old pages that day. */
const SAFE_DROP = 0.5;

const roleV = v.object({
  code: v.string(),
  externalId: v.string(),
  company: v.string(),
  companySlug: v.string(),
  title: v.string(),
  location: v.string(),
  workSetting: v.optional(v.string()),
  postedAt: v.optional(v.string()),
  url: v.string(),
  city: v.string(),
  family: v.string(),
  href: v.string(),
});

const rawV = v.object({ externalId: v.string(), company: v.string(), title: v.string(), location: v.string(), workSetting: v.optional(v.string()), postedAt: v.optional(v.string()), url: v.string() });

/** A page of India and India-open roles from the careers boards, without LinkedIn and Google pool roles (they link elsewhere). */
export const indiaPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ rows: v.array(rawV), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("careerJobs").withIndex("by_india", (q) => q.eq("india", true)).paginate({ numItems: 1500, cursor });
    return {
      rows: page.page
        .filter((r) => !/^(linkedin|gjobs):/.test(r.externalId))
        .map((r) => ({ externalId: r.externalId, company: r.company, title: r.title, location: r.location, workSetting: r.workSetting, postedAt: r.postedAt, url: r.url })),
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/** A page of the current public roles' codes. */
export const codesPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ rows: v.array(v.object({ id: v.id("publicRoles"), code: v.string() })), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("publicRoles").paginate({ numItems: 2000, cursor });
    return { rows: page.page.map((r) => ({ id: r._id, code: r.code })), cursor: page.isDone ? null : page.continueCursor };
  },
});

export const apply = internalMutation({
  args: { add: v.array(roleV), remove: v.array(v.id("publicRoles")) },
  returns: v.null(),
  handler: async (ctx, { add, remove }) => {
    for (const id of remove) await ctx.db.delete("publicRoles", id);
    for (const r of add) await ctx.db.insert("publicRoles", r);
    return null;
  },
});

/** Whether a role belongs on a public page: a real sales role, from the employer, posted recently. */
export function isPublicRole(r: { company: string; title: string; postedAt?: string }, now: number) {
  if (!isSalesTitle(r.title) || AGGREGATORS.test(r.company) || junkCompany(r.company) || storeRetailJob(r) || /\bintern(ship)?\b/i.test(r.title)) return false;
  const posted = r.postedAt ? Date.parse(r.postedAt) : NaN;
  return Number.isNaN(posted) || now - posted < MAX_AGE_DAYS * DAY;
}

/** Twice a day after the boards are read: the full list of public roles, added and removed to match. */
export const rebuild = internalAction({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const now = Date.now();
    const wanted = new Map<string, typeof roleV.type>();
    let cursor: string | null = null;
    do {
      const page: { rows: (typeof rawV.type)[]; cursor: string | null } = await ctx.runQuery(internal.publicRoles.indiaPage, { cursor });
      for (const r of page.rows) {
        if (!isPublicRole(r, now)) continue;
        const code = await publicRoleCode(r.externalId);
        // The same role posted in several cities shows once (the newest copy wins by order).
        wanted.set(code, {
          code,
          externalId: r.externalId,
          company: r.company,
          companySlug: slugify(r.company),
          title: r.title,
          location: r.location,
          ...(r.workSetting && { workSetting: r.workSetting }),
          ...(r.postedAt && { postedAt: r.postedAt }),
          url: r.url,
          city: cityOf(r.location, r.workSetting),
          family: postGroup(r.title) ?? "other",
          href: publicRoleHref(r.title, r.company, code),
        });
      }
      cursor = page.cursor;
    } while (cursor);

    const existing = new Map<string, string>();
    cursor = null;
    do {
      const page: { rows: { id: string; code: string }[]; cursor: string | null } = await ctx.runQuery(internal.publicRoles.codesPage, { cursor });
      for (const r of page.rows) existing.set(r.code, r.id);
      cursor = page.cursor;
    } while (cursor);

    const add = [...wanted.values()].filter((r) => !existing.has(r.code));
    let remove = [...existing.entries()].filter(([code]) => !wanted.has(code)).map(([, id]) => id);
    let note = "";
    if (existing.size > 100 && wanted.size < existing.size * SAFE_DROP) {
      note = ` Kept ${remove.length} that would have gone: only ${wanted.size} found against ${existing.size} listed.`;
      remove = [];
    }
    for (let i = 0; i < Math.max(add.length, remove.length); i += 200) {
      await ctx.runMutation(internal.publicRoles.apply, { add: add.slice(i, i + 200), remove: remove.slice(i, i + 200) as never });
    }
    const pinged = add.length ? await pingIndexNow([...CITIES.map((c) => `/sales-jobs/in/${c.slug}`), ...add.map((r) => r.href)]) : "";
    const summary = `Public roles: ${wanted.size} open, ${add.length} added, ${remove.length} removed.${note}${pinged}`;
    console.log(summary);
    return summary;
  },
});

// Bing and the other IndexNow engines (ChatGPT search reads Bing) hear about new role pages the same day.
// The key is public by design: jobpipe.in/<key>.txt proves the site is ours (scripts/indexnow.mjs uses it too).
const INDEXNOW_KEY = "e46e3fffed3b3f1509df1472480ed4fb";

/** Sends new public page paths to IndexNow. Live site only: INDEXNOW_ON=1 is set on prod, so dev roles never get pinged. */
async function pingIndexNow(paths: string[]): Promise<string> {
  if (env.INDEXNOW_ON !== "1") return "";
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: "jobpipe.in", key: INDEXNOW_KEY, keyLocation: `https://jobpipe.in/${INDEXNOW_KEY}.txt`, urlList: paths.slice(0, 10000).map((p) => `https://jobpipe.in${p}`) }),
      signal: AbortSignal.timeout(20_000),
    });
    return ` IndexNow ${res.status} for ${Math.min(paths.length, 10000)} pages.`;
  } catch (err) {
    return ` IndexNow failed: ${String(err).slice(0, 100)}.`;
  }
}

const publicV = v.object({
  code: v.string(),
  externalId: v.string(),
  company: v.string(),
  companySlug: v.string(),
  title: v.string(),
  location: v.string(),
  workSetting: v.optional(v.string()),
  postedAt: v.optional(v.string()),
  url: v.string(),
  city: v.string(),
  family: v.string(),
  href: v.string(),
});
const strip = ({ _id, _creationTime, ...r }: { _id: unknown; _creationTime: number } & typeof publicV.type) => r;

/** One role and its full text, for its page. Null once it's off the list, so the page goes away. */
export const byCode = query({
  args: { code: v.string() },
  returns: v.union(v.object({ role: publicV, description: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, { code }) => {
    const role = await ctx.db.query("publicRoles").withIndex("by_code", (q) => q.eq("code", code.slice(0, 12))).first();
    if (!role) return null;
    const text = await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", role.externalId)).first();
    return { role: strip(role), description: text?.description ?? null };
  },
});

/** Every public role in short, for the sitemap and the city and company lists. */
export const all = query({
  args: {},
  returns: v.array(v.object({ href: v.string(), postedAt: v.optional(v.string()), city: v.string(), companySlug: v.string(), company: v.string() })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("publicRoles").take(8000);
    return rows.map((r) => ({ href: r.href, ...(r.postedAt && { postedAt: r.postedAt }), city: r.city, companySlug: r.companySlug, company: r.company }));
  },
});

/** A city's open sales roles, newest first. */
export const inCity = query({
  args: { city: v.string() },
  returns: v.array(publicV),
  handler: async (ctx, { city }) => {
    const rows = await ctx.db.query("publicRoles").withIndex("by_city", (q) => q.eq("city", city)).take(1500);
    return rows.map(strip).sort((a, b) => (Date.parse(b.postedAt ?? "") || 0) - (Date.parse(a.postedAt ?? "") || 0));
  },
});

/** A company's open sales roles in India and remote. */
export const atCompany = query({
  args: { companySlug: v.string() },
  returns: v.array(publicV),
  handler: async (ctx, { companySlug }) => {
    const rows = await ctx.db.query("publicRoles").withIndex("by_companySlug", (q) => q.eq("companySlug", companySlug)).take(300);
    return rows.map(strip).sort((a, b) => (Date.parse(b.postedAt ?? "") || 0) - (Date.parse(a.postedAt ?? "") || 0));
  },
});
