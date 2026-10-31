// Finds a company's own careers board (Ashby, Greenhouse, Lever and others) from its name and website,
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

/** The first careers board that answers with at least one open role. */
export async function findBoard(c: Candidate): Promise<{ ats: CareerBoard["ats"]; slug: string } | null> {
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
    const rippling = await ok(`https://api.rippling.com/platform/api/ats/v1/board/${slug}/jobs`);
    if (rippling && rippling.startsWith("[") && (JSON.parse(rippling) as unknown[]).length) return { ats: "rippling", slug };
  }
  return null;
}

