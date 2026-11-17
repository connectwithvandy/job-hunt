// Finds a company's own careers board (Ashby, Greenhouse, Lever, Workable, Recruitee, Teamtailor, BambooHR and others) from its name and website,
// by trying the addresses those systems use and keeping the first one with open roles.
import type { CareerBoard } from "./careerBoards";

export type Candidate = { name: string; website: string; slug?: string };

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

/** Workable only answers a search, sent as a POST. */
async function workableHasJobs(slug: string) {
  try {
    const res = await fetch(`https://apply.workable.com/api/v3/accounts/${slug}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "", location: [], department: [], worktype: [], remote: [] }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok && !!((await res.json()) as { results?: unknown[] }).results?.length;
  } catch {
    return false;
  }
}

type Found = { ats: CareerBoard["ats"]; slug: string };

/**
 * The first careers board that answers with at least one open role. `skip` ("ats:slug") passes over a board
 * already known, so a company whose page went quiet can be looked up again for where it moved.
 */
export async function findBoard(c: Candidate, skip?: string): Promise<Found | null> {
  for await (const b of boards(c)) if (`${b.ats}:${b.slug}` !== skip) return b;
  return null;
}

async function* boards(c: Candidate): AsyncGenerator<Found> {
  for (const slug of guesses(c)) {
    const ashby = await ok(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (ashby && (JSON.parse(ashby) as { jobs?: unknown[] }).jobs?.length) yield { ats: "ashby", slug };
    const gh = await ok(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    if (gh && (JSON.parse(gh) as { jobs?: unknown[] }).jobs?.length) yield { ats: "greenhouse", slug };
    const lever = await ok(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=1`);
    if (lever && (JSON.parse(lever) as unknown[]).length) yield { ats: "lever", slug };
    // Keka sends unknown names elsewhere, so a plain answer with a board id means it's real.
    const keka = await ok(`https://${slug}.keka.com/careers`);
    if (keka && /ats\/documents\/[0-9a-f-]{36}\//.test(keka)) yield { ats: "keka", slug };
    // Zoho answers every name; a real board carries its hidden list of roles.
    for (const tld of ["in", "com"]) {
      const zoho = await ok(`https://${slug}.zohorecruit.${tld}/jobs/Careers`);
      if (zoho && /id="jobs"/.test(zoho) && !/value="\[\]"[^>]*id="jobs"|id="jobs"[^>]*value="\[\]"/.test(zoho)) yield { ats: "zoho", slug: `${slug}.zohorecruit.${tld}` };
    }
    const freshteam = await ok(`https://${slug}.freshteam.com/jobs`);
    if (freshteam && !freshteam.includes("couldn't find") && /data-portal-location=/.test(freshteam)) yield { ats: "freshteam", slug };
    // SmartRecruiters answers every name; a real board has roles.
    const sr = await ok(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`);
    if (sr && (JSON.parse(sr) as { totalFound?: number }).totalFound) yield { ats: "smartrecruiters", slug };
    const rippling = await ok(`https://api.rippling.com/platform/api/ats/v1/board/${slug}/jobs`);
    if (rippling && rippling.startsWith("[") && (JSON.parse(rippling) as unknown[]).length) yield { ats: "rippling", slug };
    if (await workableHasJobs(slug)) yield { ats: "workable", slug };
    const recruitee = await ok(`https://${slug}.recruitee.com/api/offers/`);
    if (recruitee && (JSON.parse(recruitee) as { offers?: unknown[] }).offers?.length) yield { ats: "recruitee", slug };
    const teamtailor = await ok(`https://${slug}.teamtailor.com/jobs.rss`);
    if (teamtailor && teamtailor.includes("<item>")) yield { ats: "teamtailor", slug: `${slug}.teamtailor.com` };
    // BambooHR sends unknown names elsewhere; a real board answers with its list.
    const bamboo = await ok(`https://${slug}.bamboohr.com/careers/list`);
    if (bamboo && bamboo.startsWith("{") && (JSON.parse(bamboo) as { result?: unknown[] }).result?.length) yield { ats: "bamboohr", slug };
  }
}

