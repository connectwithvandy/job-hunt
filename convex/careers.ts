import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
