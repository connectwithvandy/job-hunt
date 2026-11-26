// Short JobPipe pages for the jobs in the owner's daily LinkedIn post: one per job (jobpipe.in/p/CODE) and one per
// day listing the whole post (jobpipe.in/p/YYYYMMDD). Job codes are at most 7 characters, so 8 digits is always a day.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// externalId: the careers-board role it came from (26 Nov 2026), so Apply can save it to a member's list with its description.
const jobV = v.object({ code: v.string(), company: v.string(), title: v.string(), where: v.string(), url: v.string(), externalId: v.optional(v.string()), line: v.optional(v.string()), description: v.optional(v.string()) });

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

/** Saves the day's post jobs (ones already saved keep their page, filling in a missing line or careers id) and the day's list, replacing an earlier run's. */
export const save = internalMutation({
  args: { jobs: v.array(jobV), day: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { jobs, day }) => {
    for (const j of jobs) {
      const existing = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", j.code)).first();
      if (!existing) await ctx.db.insert("postedJobs", j);
      // A job posted again keeps its page, but picks up the line and careers id it didn't have then (26 Nov 2026).
      else if ((j.line && !existing.line) || (j.externalId && !existing.externalId) || (j.description && !existing.description))
        await ctx.db.patch(existing._id, {
          ...(j.line && !existing.line ? { line: j.line } : {}),
          ...(j.externalId && !existing.externalId ? { externalId: j.externalId } : {}),
          ...(j.description && !existing.description ? { description: j.description } : {}),
        });
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
      // The list shows title, company and line only, so the long descriptions stay out of it.
      if (j) out.push({ code: j.code, company: j.company, title: j.title, where: j.where, url: j.url, ...(j.externalId ? { externalId: j.externalId } : {}), ...(j.line ? { line: j.line } : {}) });
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
    if (!j) return null;
    // Jobs saved before descriptions were kept read theirs from the careers board, while the company still lists it.
    const board = !j.description && j.externalId ? await ctx.db.query("careerJobTexts").withIndex("by_externalId", (q) => q.eq("externalId", j.externalId!)).first() : null;
    const description = j.description ?? board?.description.slice(0, 12_000);
    return { code: j.code, company: j.company, title: j.title, where: j.where, url: j.url, ...(j.externalId ? { externalId: j.externalId } : {}), ...(j.line ? { line: j.line } : {}), ...(description ? { description } : {}) };
  },
});

/** Counts a visit to a job's page (or a day's list) and Apply clicks, so we know which posts bring people (26 Nov 2026). */
export const count = mutation({
  args: { code: v.string(), kind: v.union(v.literal("visit"), v.literal("apply"), v.literal("reached")) },
  returns: v.null(),
  handler: async (ctx, { code, kind }) => {
    if (/^\d{8}$/.test(code)) {
      const list = await ctx.db.query("postLists").withIndex("by_day", (q) => q.eq("day", code)).first();
      if (list && kind === "visit") await ctx.db.patch(list._id, { visits: (list.visits ?? 0) + 1 });
      return null;
    }
    const j = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", code.slice(0, 16))).first();
    if (!j) return null;
    if (kind === "visit") await ctx.db.patch(j._id, { visits: (j.visits ?? 0) + 1 });
    else if (kind === "apply") await ctx.db.patch(j._id, { applyClicks: (j.applyClicks ?? 0) + 1 });
    // Got through sign-up and setup to the job inside JobPipe: the step where people drop off shows here.
    else await ctx.db.patch(j._id, { reachedJob: (j.reachedJob ?? 0) + 1 });
    return null;
  },
});

/** A day's post results for the morning email: visits and Apply clicks across its jobs, and sign-ups from the post
 * in the day after it. Null when there was no post that day. */
export const results = internalQuery({
  args: { day: v.string(), since: v.number() },
  returns: v.union(v.object({ jobs: v.number(), visits: v.number(), applyClicks: v.number(), reachedJob: v.number(), signUps: v.number() }), v.null()),
  handler: async (ctx, { day, since }) => {
    const list = await ctx.db.query("postLists").withIndex("by_day", (q) => q.eq("day", day)).first();
    if (!list) return null;
    let visits = list.visits ?? 0;
    let applyClicks = 0;
    let reachedJob = 0;
    for (const code of list.codes) {
      const j = await ctx.db.query("postedJobs").withIndex("by_code", (q) => q.eq("code", code)).first();
      visits += j?.visits ?? 0;
      applyClicks += j?.applyClicks ?? 0;
      reachedJob += j?.reachedJob ?? 0;
    }
    let signUps = 0;
    for await (const a of ctx.db.query("access").order("desc")) {
      if (a._creationTime < since) break;
      if (a.source === "linkedin-post") signUps++;
    }
    return { jobs: list.codes.length, visits, applyClicks, reachedJob, signUps };
  },
});
