// Where a company's logo comes from when the job came without one: the company's own website, known from
// our careers-board list or from the job's own link when that isn't a job board. Never a guess, so never
// the wrong logo; with no website the card keeps its letter.
import { CAREER_BOARDS } from "../../convex/lib/careerBoards";
import { companyKey } from "../../convex/lib/company";

const SITES = new Map(CAREER_BOARDS.map((b) => [companyKey(b.name), b.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]]));

/** Job boards and hiring systems: their address says nothing about the company's own website. */
const BOARDS =
  /(greenhouse|lever\.co|ashbyhq|myworkdayjobs|workday|smartrecruiters|linkedin|naukri|indeed|keka|zoho|freshteam|rippling|workable|recruitee|teamtailor|bamboohr|eightfold|recruiterbox|adzuna|google|foundit|instahyre|iimjobs|cutshort|wellfound|glassdoor|apna|shine|hirist|ycombinator|jobvite|icims|taleo|successfactors|oraclecloud|darwinbox|breezy|jazzhr|bayt|gulftalent|naukrigulf|dubizzle|monster|timesjobs|hirect|jobs\.|careers-page|applytojob|dreamwork)/i;

export function companySite(company: string, url?: string): string | null {
  const known = SITES.get(companyKey(company));
  if (known) return known;
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (BOARDS.test(host)) return null;
    // careers.acme.com and jobs.acme.com belong to acme.com.
    return host.replace(/^(careers|jobs|apply|work|join)\./, "");
  } catch {
    return null;
  }
}

export const faviconOf = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
