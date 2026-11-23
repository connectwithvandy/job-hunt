"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import type { CareerBoard } from "./lib/careerBoards";
import { companyKey } from "./lib/company";
import { findBoard, type Candidate } from "./lib/boardFinder";
import { countBySource, mergeCandidates, rankByCount, type FinderSource, type SourcedCandidate } from "./lib/finderCandidates";

// The weekly finder: looks up B2B, SaaS and AI startups on every careers system we read
// (Ashby, Greenhouse, Lever, Keka, Zoho Recruit, Freshteam, SmartRecruiters, Rippling, Workable, Recruitee,
// Teamtailor, BambooHR; Workday has no guessable address), and adds
// the ones it finds to the morning download. Each company is looked up about once a month.
// Since 19 Nov it also looks up companies where members have LinkedIn connections, companies behind the paid
// LinkedIn and Google jobs, and companies members are applying to (up to 300 new ones a week, lib/finderCandidates.ts).


// Free, public copy of the YC directory, refreshed daily: https://github.com/yc-oss/api
const YC_HIRING = "https://yc-oss.github.io/api/companies/hiring.json";
type YcCompany = { name: string; slug: string; website: string; industry: string; tags: string[]; regions: string[]; status: string };

const B2B_TAGS = /\b(b2b|saas|artificial intelligence|generative ai|ai|developer tools|enterprise|sales|marketing|analytics|infrastructure|security|fintech)\b/i;
// "Partly Remote" and Southeast Asia added 13 Nov: many of these also hire sales in India or APAC.
const OPEN_TO_INDIA = new Set(["India", "South Asia", "Southeast Asia", "Remote", "Fully Remote", "Partly Remote"]);

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

const sourceV = v.union(v.literal("yc"), v.literal("dream"), v.literal("connections"), v.literal("pool"), v.literal("applied"));
const candidateV = v.object({ name: v.string(), website: v.string(), slug: v.optional(v.string()), from: sourceV });

export const find = internalAction({
  // `again` looks everyone up now, even if checked this month: run it after adding a careers system.
  // `list` is built once by the first run and handed on, so the follow-up runs don't read everything again.
  args: { start: v.optional(v.number()), again: v.optional(v.boolean()), list: v.optional(v.array(candidateV)), tally: v.optional(v.string()) },
  handler: async (ctx, { start = 0, again, list, tally = "" }) => {
    if (env.SCHEDULED_OFF === "1") return null;
    // The checked boards in lib/seedBoards.ts, in case nobody added them by hand after the deploy.
    if (start === 0) await ctx.runMutation(internal.careers.addSeedBoards, {});
    const everyone = list ?? (await buildList(ctx, !!again));
    const slice = everyone.slice(start, start + CHUNK);
    const due = new Set<string>(await ctx.runQuery(internal.careers.unchecked, { keys: slice.map((c) => companyKey(c.name)) }));
    const todo = again ? slice : slice.filter((c) => due.has(companyKey(c.name)));
    const found: { name: string; ats: CareerBoard["ats"]; slug: string; from: FinderSource }[] = [];
    for (let i = 0; i < todo.length; i += 5) {
      const batch = todo.slice(i, i + 5);
      const boards = await Promise.all(batch.map((c) => findBoard(c).catch(() => null)));
      boards.forEach((b, k) => b && found.push({ name: batch[k].name, from: batch[k].from, ...b }));
    }
    await ctx.runMutation(internal.careers.recordFinds, { checked: todo.map((c) => companyKey(c.name)), found: found.map(({ name, ats, slug }) => ({ name, ats, slug })) });
    console.log(`Finder ${start + 1}-${start + slice.length} of ${everyone.length}: looked up ${todo.length}, found ${found.map((f) => `${f.name} (${f.ats})`).join(", ") || "none"}.`);
    const total = [tally, countBySource(found)].filter(Boolean).join(", ");
    if (start + CHUNK < everyone.length) await ctx.scheduler.runAfter(0, internal.careersFinder.find, { start: start + CHUNK, again, list: everyone, tally: total });
    else console.log(`Finder done: ${everyone.length} companies, new boards by source: ${total || "none"}.`);
    return null;
  },
});

/** Every company to look up this week: YC and Dream companies, then up to 300 new ones from the extra sources. */
async function buildList(ctx: ActionCtx, again: boolean): Promise<SourcedCandidate[]> {
  const fromYc = await ycCandidates().catch((err) => (console.warn("YC list failed:", String(err)), [] as Candidate[]));
  const fromPeople: Candidate[] = await ctx.runQuery(internal.careers.prospectCompanies, {});
  const base: SourcedCandidate[] = [...fromYc.map((c) => ({ ...c, from: "yc" as const })), ...fromPeople.map((c) => ({ ...c, from: "dream" as const }))];

  // Connections: read in pages of 4,000, never all at once.
  const connectionNames: string[] = [];
  for (let cursor: string | null = null, pages = 0; pages < 50; pages++) {
    const page: { names: string[]; cursor: string; isDone: boolean } = await ctx.runQuery(internal.careers.connectionCompanyPage, { cursor });
    connectionNames.push(...page.names);
    if (page.isDone) break;
    cursor = page.cursor;
  }
  const appliedNames: string[] = [];
  for (const userId of await ctx.runQuery(internal.careers.memberIds, {})) appliedNames.push(...(await ctx.runQuery(internal.careers.appliedCompanies, { userId })));
  const poolNames: string[] = await ctx.runQuery(internal.careers.poolCompanies, {});

  // Applications first (someone is in motion there), then the most-connected companies, then the paid pools.
  const ranked: SourcedCandidate[] = [
    ...rankByCount(appliedNames).map((name) => ({ name, website: "", from: "applied" as const })),
    ...rankByCount(connectionNames).map((name) => ({ name, website: "", from: "connections" as const })),
    ...rankByCount(poolNames).map((name) => ({ name, website: "", from: "pool" as const })),
  ];
  const haveBoard = new Set<string>(await ctx.runQuery(internal.careers.boardKeys, {}));
  // Only companies not looked up this month count toward the weekly 300, so the same ones aren't picked every week.
  const fresh = ranked.filter((c) => !haveBoard.has(companyKey(c.name))).slice(0, 3000);
  const due = new Set<string>();
  if (!again) {
    for (let i = 0; i < fresh.length; i += 200) {
      for (const key of await ctx.runQuery(internal.careers.unchecked, { keys: fresh.slice(i, i + 200).map((c) => companyKey(c.name)) })) due.add(key);
    }
  }
  const extra = again ? fresh : fresh.filter((c) => due.has(companyKey(c.name)));
  return mergeCandidates(base, extra, haveBoard);
}
