// Reads public LinkedIn posts through Apify's ready-made tools ("actors"). Each run has a hard cost cap,
// and only the owner's account uses it for now: LinkedIn's rules forbid automated reading, so it stays small.

import { ConvexError } from "convex/values";
import { env } from "../_generated/server";

/** Runs an Apify actor and waits for its results. `maxUsd` stops it charging past that. */
async function run<T>(actor: string, input: Record<string, unknown>, maxUsd: number, seconds = 150): Promise<T[]> {
  if (!env.APIFY_TOKEN) throw new ConvexError("LinkedIn reading isn't switched on: add an Apify token first.");
  const params = new URLSearchParams({ timeout: String(seconds), maxTotalChargeUsd: String(maxUsd) });
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?${params}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.APIFY_TOKEN}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((seconds + 20) * 1000),
  }).catch(() => null);
  if (!res) throw new ConvexError("Apify didn't answer. Try again in a minute.");
  if (!res.ok) {
    // Apify says why in the body ("actor-is-not-rented", "invalid-input"): keep it, so a failure can be fixed without guessing (13 Nov).
    const why = await res
      .json()
      .then((b: { error?: { type?: string; message?: string } }) => [b.error?.type, b.error?.message].filter(Boolean).join(": "))
      .catch(() => "");
    throw new ConvexError(`Apify answered ${res.status}${why ? ` (${why.slice(0, 200)})` : ""}. Check the token and the account's credit.`);
  }
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items as T[]) : [];
}

export type Post = { id: string; text: string; url: string; at?: number; author: { name: string; headline: string; url: string } };

type RawPost = {
  type?: string;
  id?: string;
  linkedinUrl?: string;
  content?: string;
  author?: { name?: string; info?: string; linkedinUrl?: string; publicIdentifier?: string };
  postedAt?: { timestamp?: number };
};

/** LinkedIn sends some text with HTML escapes ("Sales &amp; BD"), sometimes twice over ("&amp;amp;"); turn them back into characters. */
const unescapeOnce = (t: string) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const unescape = (t: string) => unescapeOnce(unescapeOnce(t));

function toPost(p: RawPost): Post | null {
  if (!p.id || !p.content?.trim()) return null;
  const handle = p.author?.publicIdentifier;
  return {
    id: p.id,
    text: unescape(p.content.trim()),
    url: p.linkedinUrl ?? "",
    at: p.postedAt?.timestamp,
    author: {
      name: unescape(p.author?.name ?? ""),
      headline: unescape(p.author?.info ?? ""),
      // Their plain profile link, without LinkedIn's tracking bits.
      url: handle ? `https://www.linkedin.com/in/${handle}/` : (p.author?.linkedinUrl?.split("?")[0] ?? ""),
    },
  };
}

/**
 * The owner-only uses (her own LinkedIn job search, the morning-email jobs post, open-to-work people, hiring posts,
 * contacts' recent posts) are off unless APIFY_OWNER_EXTRAS is "on": together they used up the free $9 a month by
 * 12 Nov and stopped the shared LinkedIn pool that everyone's search uses. Off, they return nothing.
 */
export const ownerExtrasOn = () => env.APIFY_OWNER_EXTRAS === "on";

/** A person's latest posts, newest first. About $0.01 for five. Owner-only. */
export async function recentPosts(profileUrl: string, max = 5) {
  if (!ownerExtrasOn()) return [];
  const rows = await run<RawPost>("harvestapi~linkedin-profile-posts", { targetUrls: [profileUrl], maxPosts: max, includeReposts: false }, 0.05);
  return rows.map(toPost).filter((p): p is Post => !!p).slice(0, max);
}

/** Posts from the last week (or day) matching each search, like "hiring sales manager bengaluru". About $0.02 per ten. */
export async function searchPosts(queries: string[], perQuery = 10, since: "24h" | "week" = "week") {
  // Owner-only: see ownerExtrasOn.
  if (!ownerExtrasOn()) return [];
  const rows = await run<RawPost>("harvestapi~linkedin-post-search", { searchQueries: queries, maxPosts: perQuery, postedLimit: since, sortBy: "date", profileScraperMode: "short" }, 0.25);
  const seen = new Set<string>();
  return rows.map(toPost).filter((p): p is Post => !!p && !seen.has(p.id) && !!seen.add(p.id));
}

type RawJob = {
  id?: string;
  title?: string;
  linkedinUrl?: string;
  postedDate?: string;
  descriptionText?: string;
  location?: { linkedinText?: string };
  workplaceType?: string;
  salary?: { text?: string } | null;
  applyMethod?: { companyApplyUrl?: string } | null;
  company?: { name?: string; logo?: string };
};

export type LinkedInJob = {
  id: string; title: string; company: string; companyLogo?: string; location: string; workSetting?: string;
  salary?: string; postedAt?: string; url: string; applyUrl?: string; description?: string;
};

/**
 * LinkedIn job listings for each search, which can join titles with OR. About $0.001 a job, and
 * `maxUsd` caps the run. `shared` marks the pool everyone uses. `where` is a place LinkedIn knows ("Bengaluru", "India"); `remote` keeps remote roles only.
 */
export async function searchJobs(queries: string[], where: string | undefined, remote: boolean, since: "24h" | "week" | "month", perQuery: number, maxUsd: number, shared = false) {
  // Only the shared pool runs unless the owner's extras are on (ownerExtrasOn).
  if (!shared && !ownerExtrasOn()) return [];
  const rows = await run<RawJob>(
    "harvestapi~linkedin-job-search",
    { jobTitles: queries, ...(where ? { locations: [where] } : {}), ...(remote ? { workplaceType: ["remote"] } : {}), postedLimit: since, sortBy: "date", maxItems: perQuery },
    maxUsd,
    // The shared pool reads up to 120 a search, which ran past 150 seconds (13 Nov: 3 of 5 timed out).
    shared ? 300 : 150,
  );
  const seen = new Set<string>();
  return rows.flatMap((j): LinkedInJob[] => {
    if (!j.id || !j.title || !j.company?.name || seen.has(j.id)) return [];
    seen.add(j.id);
    return [{
      id: j.id,
      title: j.title,
      company: j.company.name,
      // Apify sends null for missing fields; the database takes a missing field, never null (13 Nov: a null salary failed the whole pool).
      companyLogo: j.company.logo || undefined,
      location: j.location?.linkedinText || "",
      workSetting: j.workplaceType === "remote" ? "remote" : j.workplaceType === "hybrid" ? "hybrid" : j.workplaceType === "on_site" ? "onsite" : undefined,
      salary: j.salary?.text || undefined,
      postedAt: j.postedDate || undefined,
      url: j.linkedinUrl || `https://www.linkedin.com/jobs/view/${j.id}/`,
      applyUrl: j.applyMethod?.companyApplyUrl || undefined,
      description: j.descriptionText || undefined,
    }];
  });
}

type RawGoogleJob = {
  jobId?: string;
  title?: string;
  companyName?: string;
  location?: string;
  remote?: boolean;
  description?: string;
  applyUrl?: string;
  applyLinks?: { board?: string; url?: string }[] | null;
  postedDate?: string;
  salaryRaw?: string | null;
};

export type GoogleJob = {
  id: string; title: string; company: string; location: string; workSetting?: string;
  salary?: string; postedAt?: string; links: string[]; description?: string;
};

/**
 * Google Jobs listings in India for these searches, posted in the last 3 days: Google gathers Naukri, Indeed, LinkedIn and
 * companies' own pages, so this reaches roles our careers-board readers miss. About $2.50 per 1,000 jobs
 * plus $0.005 a run (actor memo23/google-jobs-scraper); `maxUsd` caps each run.
 */
export async function searchGoogleJobs(queries: string[], max: number, maxUsd: number): Promise<GoogleJob[]> {
  const rows = await run<RawGoogleJob>("memo23~google-jobs-scraper", { keywords: queries, locations: [], country: "in", language: "en", datePosted: "3days", maxItems: max }, maxUsd, 300);
  const seen = new Set<string>();
  return rows.flatMap((j): GoogleJob[] => {
    if (!j.jobId || !j.title || !j.companyName || seen.has(j.jobId)) return [];
    seen.add(j.jobId);
    // Apify sends null for missing fields; the database takes a missing field, never null.
    const links = [j.applyUrl, ...(j.applyLinks ?? []).map((l) => l.url)].filter((u): u is string => !!u && /^https?:\/\//i.test(u));
    return [{
      id: j.jobId,
      title: j.title.trim(),
      company: j.companyName.trim(),
      location: j.location?.trim() || "India",
      workSetting: j.remote ? "remote" : undefined,
      salary: j.salaryRaw || undefined,
      postedAt: j.postedDate || undefined,
      links: [...new Set(links)],
      description: j.description || undefined,
    }];
  });
}
