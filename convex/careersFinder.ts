"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { CareerBoard } from "./lib/careerBoards";
import { companyKey } from "./lib/company";
import { findBoard, type Candidate } from "./lib/boardFinder";

// The weekly finder: looks up B2B, SaaS and AI startups on every careers system we read
// (Ashby, Greenhouse, Lever, Keka, Zoho Recruit, Freshteam, SmartRecruiters, Rippling; Workday has no guessable address), and adds
// the ones it finds to the morning download. Each company is looked up about once a month.


// Free, public copy of the YC directory, refreshed daily: https://github.com/yc-oss/api
const YC_HIRING = "https://yc-oss.github.io/api/companies/hiring.json";
type YcCompany = { name: string; slug: string; website: string; industry: string; tags: string[]; regions: string[]; status: string };

const B2B_TAGS = /\b(b2b|saas|artificial intelligence|generative ai|ai|developer tools|enterprise|sales|marketing|analytics|infrastructure|security|fintech)\b/i;
const OPEN_TO_INDIA = new Set(["India", "South Asia", "Remote", "Fully Remote"]);

async function ycCandidates(): Promise<Candidate[]> {
  const res = await fetch(YC_HIRING, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`YC list answered ${res.status}`);
  const all = (await res.json()) as YcCompany[];
  return all
    .filter((c) => c.status === "Active" && c.regions.some((r) => OPEN_TO_INDIA.has(r)))
    // B2B and AI only: consumer, healthcare and hardware companies are left out.
    .filter((c) => c.industry === "B2B" || c.tags.some((t) => B2B_TAGS.test(t)))
    .map((c) => ({ name: c.name, website: c.website, slug: c.slug }));
}

// Companies per run; the rest go to a follow-up run.
const CHUNK = 30;

export const find = internalAction({
  // `again` looks everyone up now, even if checked this month: run it after adding a careers system.
  args: { start: v.optional(v.number()), again: v.optional(v.boolean()) },
  handler: async (ctx, { start = 0, again }) => {
    const fromYc = await ycCandidates().catch((err) => (console.warn("YC list failed:", String(err)), [] as Candidate[]));
    const fromPeople: Candidate[] = await ctx.runQuery(internal.careers.prospectCompanies, {});
    const everyone = [...new Map([...fromYc, ...fromPeople].map((c) => [companyKey(c.name), c])).entries()].filter(([key]) => key);
    const slice = everyone.slice(start, start + CHUNK);
    const due = new Set<string>(await ctx.runQuery(internal.careers.unchecked, { keys: slice.map(([key]) => key) }));
    const todo = again ? slice : slice.filter(([key]) => due.has(key));
    const found: { name: string; ats: CareerBoard["ats"]; slug: string }[] = [];
    for (let i = 0; i < todo.length; i += 5) {
      const batch = todo.slice(i, i + 5);
      const boards = await Promise.all(batch.map(([, c]) => findBoard(c).catch(() => null)));
      boards.forEach((b, k) => b && found.push({ name: batch[k][1].name, ...b }));
    }
    await ctx.runMutation(internal.careers.recordFinds, { checked: todo.map(([key]) => key), found });
    console.log(`Finder ${start + 1}-${start + slice.length} of ${everyone.length}: looked up ${todo.length}, found ${found.map((f) => `${f.name} (${f.ats})`).join(", ") || "none"}.`);
    if (start + CHUNK < everyone.length) await ctx.scheduler.runAfter(0, internal.careersFinder.find, { start: start + CHUNK, again });
    return null;
  },
});
