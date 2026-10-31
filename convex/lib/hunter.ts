// Hunter.io's Email Finder: a person's work email from their name and their company's website.
// Free plan: 50 credits a month, one per email found; a search that finds nothing costs nothing.
// Docs: https://hunter.io/api-documentation/v2#email-finder

/** What Hunter said, in the few shapes the app cares about. */
export type FinderResult =
  | { kind: "found"; email: string; score: number; verified: boolean }
  | { kind: "none" }
  /** The person asked Hunter not to process their data. */
  | { kind: "claimed" }
  /** Hunter can't use this website: wrong, or it has no mail server. */
  | { kind: "badDomain" }
  /** The free credits on Hunter's side are used up. */
  | { kind: "usedUp" }
  | { kind: "error"; message: string };

// Job boards, hiring tools and free mail: their address says nothing about the company's own website.
const NOT_COMPANY = [
  "linkedin.com", "indeed.com", "naukri.com", "glassdoor.com", "wellfound.com", "angel.co", "instahyre.com", "iimjobs.com", "foundit.in", "monster.com",
  "himalayas.app", "adzuna.com", "adzuna.in", "ycombinator.com", "workatastartup.com", "google.com", "googleusercontent.com",
  "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "keka.com", "zohorecruit.com", "zoho.com",
  "workable.com", "recruitee.com", "bamboohr.com", "jobvite.com", "icims.com", "breezy.hr", "teamtailor.com", "personio.com", "rippling.com", "darwinbox.in",
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "proton.me", "protonmail.com", "rediffmail.com",
];

/** The bare website, like "rubrik.com", from a link, an email address or a typed domain. "" if it isn't one. */
export function domainOf(input: string) {
  let s = input.trim().toLowerCase();
  if (!s) return "";
  if (s.includes("@") && !s.includes("/")) s = s.slice(s.lastIndexOf("@") + 1);
  s = s.replace(/^[a-z]+:\/\//, "").replace(/[/?#:].*$/, "").replace(/^www\./, "").replace(/[>.\s]+$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s) ? s : "";
}

/** Whether a website is the company's own, not a job board, hiring tool or free mail. */
export function isCompanyDomain(domain: string) {
  return !!domain && !NOT_COMPANY.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** The main website behind a subdomain, like "acme.com" from "careers.acme.com" or "acme.co.in" from "jobs.acme.co.in". */
export function rootDomain(domain: string) {
  const parts = domain.split(".");
  const keep = parts.length >= 3 && /^(co|com|net|org|ac|gov)$/.test(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

/** First and last name for the lookup, without titles or letters after the name. Null when there's only one name. */
export function splitName(full: string) {
  const words = full
    .replace(/\(.*?\)/g, " ")
    .replace(/,.*$/, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}'-]/gu, ""))
    .filter((w) => w && !/^(mr|mrs|ms|miss|dr|prof)$/i.test(w));
  if (words.length < 2) return null;
  return { first: words[0], last: words[words.length - 1] };
}

/** Reads Hunter's answer. Never makes up an address: anything that isn't a clean email counts as not found. */
export function parseFinder(status: number, body: unknown): FinderResult {
  const b = (body ?? {}) as { data?: { email?: unknown; score?: unknown; verification?: { status?: unknown } | null }; errors?: { id?: unknown; details?: unknown }[] };
  if (status === 451) return { kind: "claimed" };
  if (status === 429) return { kind: "usedUp" };
  if (status === 401) return { kind: "error", message: "Hunter.io didn't accept the app's key." };
  if (status === 403) return { kind: "error", message: "Hunter.io is busy. Try again in a minute." };
  const errorId = typeof b.errors?.[0]?.id === "string" ? b.errors[0].id : "";
  if (errorId === "invalid_domain") return { kind: "badDomain" };
  if (status === 404) return { kind: "none" };
  if (status < 200 || status >= 300) {
    const details = typeof b.errors?.[0]?.details === "string" ? b.errors[0].details : `answered ${status}`;
    return { kind: "error", message: `Hunter.io: ${details}` };
  }
  const email = typeof b.data?.email === "string" ? b.data.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return { kind: "none" };
  const score = typeof b.data?.score === "number" ? Math.max(0, Math.min(100, Math.round(b.data.score))) : 0;
  return { kind: "found", email, score, verified: b.data?.verification?.status === "valid" };
}

/** Asks Hunter for one person's email at one website. */
export async function hunterFind(apiKey: string, domain: string, first: string, last: string): Promise<FinderResult> {
  const params = new URLSearchParams({ domain, first_name: first, last_name: last, api_key: apiKey });
  try {
    const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`, { signal: AbortSignal.timeout(25_000) });
    return parseFinder(res.status, await res.json().catch(() => null));
  } catch {
    return { kind: "error", message: "Hunter.io didn't answer. Try again in a minute." };
  }
}
