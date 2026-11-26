// Short JobPipe pages for the jobs in the owner's daily LinkedIn post: one per job (jobpipe.in/p/CODE) and one per
// day listing the whole post (jobpipe.in/p/YYYYMMDD). Job codes are at most 7 characters, so 8 digits is always a day.
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// externalId: the careers-board role it came from (26 Nov 2026), so Apply can save it to a member's list with its description.
const jobV = v.object({ code: v.string(), company: v.string(), title: v.string(), where: v.string(), url: v.string(), externalId: v.optional(v.string()) });

/** Short, stable code for a job link: the same job posted twice keeps one page. */
export function postCode(url: string) {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** The day's code in India time, e.g. "20261126": the post's one link. */
export function dayCode(now: number) {
  return new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** Saves the day's post jobs (ones already saved are left as they are) and the day's list, replacing an earlier run's. */
export const save = internalMutation({
  args: { jobs: v.array(jobV), day: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { jobs, day }) => {
    for (const j of jobs) {
      const existing = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", j.code)).first();
      if (!existing) await ctx.db.insert("postedJobs", j);
    }
    if (day) {
      const codes = jobs.map((j) => j.code);
      const list = await ctx.db.query("postLists").withIndex("by_day", (q) => q.eq("day", day)).first();
      if (list) await ctx.db.patch(list._id, { codes });
      else await ctx.db.insert("postLists", { day, codes });
    }
    return null;
  },
});

/** One day's posted jobs, in the post's order, for the day's public page. Null when that day had no post. */
export const day = query({
  args: { day: v.string() },
  returns: v.union(v.array(jobV), v.null()),
  handler: async (ctx, { day }) => {
    const list = await ctx.db.query("postLists").withIndex("by_day", (q) => q.eq("day", day.slice(0, 8))).first();
    if (!list) return null;
    const out = [];
    for (const code of list.codes.slice(0, 20)) {
      const j = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", code)).first();
      if (j) out.push({ code: j.code, company: j.company, title: j.title, where: j.where, url: j.url, ...(j.externalId ? { externalId: j.externalId } : {}) });
    }
    return out;
  },
});

/** One posted job, for its public page. */
export const get = query({
  args: { code: v.string() },
  returns: v.union(jobV, v.null()),
  handler: async (ctx, { code }) => {
    const j = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", code.slice(0, 16))).first();
    return j ? { code: j.code, company: j.company, title: j.title, where: j.where, url: j.url, ...(j.externalId ? { externalId: j.externalId } : {}) } : null;
  },
});
