// Short JobPipe pages for the jobs in the owner's daily LinkedIn post (jobpipe.in/p/CODE).
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

const jobV = v.object({ code: v.string(), company: v.string(), title: v.string(), where: v.string(), url: v.string() });

/** Short, stable code for a job link: the same job posted twice keeps one page. */
export function postCode(url: string) {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Saves the day's post jobs; ones already saved are left as they are. */
export const save = internalMutation({
  args: { jobs: v.array(jobV) },
  returns: v.null(),
  handler: async (ctx, { jobs }) => {
    for (const j of jobs) {
      const existing = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", j.code)).first();
      if (!existing) await ctx.db.insert("postedJobs", j);
    }
    return null;
  },
});

/** One posted job, for its public page. */
export const get = query({
  args: { code: v.string() },
  returns: v.union(jobV, v.null()),
  handler: async (ctx, { code }) => {
    const j = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", code.slice(0, 16))).first();
    return j ? { code: j.code, company: j.company, title: j.title, where: j.where, url: j.url } : null;
  },
});
