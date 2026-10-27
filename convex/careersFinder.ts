"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { CareerBoard } from "./lib/careerBoards";
import { companyKey } from "./lib/company";

// The weekly finder: looks up B2B, SaaS and AI startups on every careers system we read
// (Ashby, Greenhouse, Lever, Keka, Zoho Recruit, Freshteam; Workday has no guessable address), and adds
// the ones it finds to the morning download. Each company is looked up about once a month.

type Candidate = { name: string; website: string; slug?: string };

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

/** Addresses a company's board is likely to use: its domain, its name squashed or hyphenated. */
function guesses(c: Candidate) {
  let stem = "";
  try {
    stem = new URL(c.website.startsWith("http") ? c.website : `https://${c.website}`).hostname.replace(/^www\./, "").split(".")[0];
  } catch {}
  const name = c.name.toLowerCase().replace(/&/g, "and");
  const all = [stem, name.replace(/[^a-z0-9]/g, ""), name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), c.slug ?? ""];
  // Short guesses like "ada" too often belong to another company.
  return [...new Set(all.map((s) => s.toLowerCase()).filter((s) => /^[a-z0-9-]{4,60}$/.test(s)))];
}

async function ok(url: string) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (res.status !== 200) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** The first careers board that answers with at least one open role. */
async function findBoard(c: Candidate): Promise<{ ats: CareerBoard["ats"]; slug: string } | null> {
  for (const slug of guesses(c)) {
    const ashby = await ok(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (ashby && (JSON.parse(ashby) as { jobs?: unknown[] }).jobs?.length) return { ats: "ashby", slug };
    const gh = await ok(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    if (gh && (JSON.parse(gh) as { jobs?: unknown[] }).jobs?.length) return { ats: "greenhouse", slug };
    const lever = await ok(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=1`);
    if (lever && (JSON.parse(lever) as unknown[]).length) return { ats: "lever", slug };
    // Keka sends unknown names elsewhere, so a plain answer with a board id means it's real.
    const keka = await ok(`https://${slug}.keka.com/careers`);
    if (keka && /ats\/documents\/[0-9a-f-]{36}\//.test(keka)) return { ats: "keka", slug };
    // Zoho answers every name; a real board carries its hidden list of roles.
    for (const tld of ["in", "com"]) {
      const zoho = await ok(`https://${slug}.zohorecruit.${tld}/jobs/Careers`);
      if (zoho && /id="jobs"/.test(zoho) && !/value="\[\]"[^>]*id="jobs"|id="jobs"[^>]*value="\[\]"/.test(zoho)) return { ats: "zoho", slug: `${slug}.zohorecruit.${tld}` };
    }
    const freshteam = await ok(`https://${slug}.freshteam.com/jobs`);
    if (freshteam && !freshteam.includes("couldn't find") && /data-portal-location=/.test(freshteam)) return { ats: "freshteam", slug };
    // SmartRecruiters answers every name; a real board has roles.
    const sr = await ok(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`);
    if (sr && (JSON.parse(sr) as { totalFound?: number }).totalFound) return { ats: "smartrecruiters", slug };
  }
  return null;
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
