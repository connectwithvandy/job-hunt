"use node";

// Job boards searched beside Dreamwork. Each one switches on when its key is set
// on the deployment (npx convex env set NAME value). Himalayas and Hacker News need no key.

import { titleMatches } from "./salesRoles";

export { titleMatches };

export type Found = {
  source: "jsearch" | "adzuna" | "himalayas" | "hn" | "careers" | "linkedin";
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  workSetting?: string;
  salary?: string;
  postedAt?: string;
  url: string;
  /** The company's own application page, when the listing (like LinkedIn's) points somewhere else. */
  applyUrl?: string;
  description?: string;
};

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

const COUNTRIES: Record<string, string> = {
  india: "in", "united states": "us", usa: "us", us: "us", "united kingdom": "gb", uk: "gb", england: "gb", london: "gb",
  germany: "de", france: "fr", netherlands: "nl", canada: "ca", australia: "au", singapore: "sg", "new zealand": "nz",
  uae: "ae", dubai: "ae", "united arab emirates": "ae",
};
const INDIA_CITIES = ["bengaluru", "bangalore", "mumbai", "delhi", "new delhi", "gurugram", "gurgaon", "noida", "pune", "hyderabad", "chennai", "kolkata", "ahmedabad", "jaipur", "kochi"];
/** Other names a listing may use for the same Indian city. */
const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ["bangalore", "karnataka"],
  bangalore: ["bengaluru", "karnataka"],
  gurugram: ["gurgaon", "delhi ncr", "ncr"],
  gurgaon: ["gurugram", "delhi ncr", "ncr"],
  delhi: ["new delhi", "delhi ncr", "ncr"],
  "new delhi": ["delhi", "delhi ncr", "ncr"],
  noida: ["delhi ncr", "ncr"],
  mumbai: ["bombay", "navi mumbai"],
  kochi: ["cochin"],
};
/** Words a listing uses for "anywhere in India" rather than one city. */
const ANY_INDIA = /\b(india|in|pan|anywhere|remote|hybrid|across|all|multiple|locations?|wfh|work from home)\b/g;

/** "Remote", "Anywhere", or a place with its two-letter country code when we can tell it. */
export function readPlace(location: string) {
  const where = location.trim().toLowerCase();
  if (where === "remote") return { kind: "remote" as const };
  if (where === "anywhere" || !where) return { kind: "anywhere" as const };
  const parts = where.split(",").map((p) => p.trim());
  const country = parts.map((p) => COUNTRIES[p] ?? (INDIA_CITIES.includes(p) ? "in" : undefined)).find(Boolean);
  return { kind: "place" as const, name: location.trim(), country };
}
type Place = ReturnType<typeof readPlace>;

// Drops half an emoji left at the cut, which the database refuses.
const cut = (text?: string | null) => (text ? text.slice(0, 8000).replace(/[\uD800-\uDBFF]$/, "") : undefined);

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

// ---------- JSearch (Google for Jobs, via RapidAPI) ----------

type JSearchJob = {
  job_id: string; job_title: string; employer_name: string; employer_logo?: string | null;
  job_location?: string | null; job_city?: string | null; job_state?: string | null; job_country?: string | null; job_is_remote?: boolean;
  job_apply_link: string; job_description?: string; job_posted_at_datetime_utc?: string | null;
  job_min_salary?: number | null; job_max_salary?: number | null; job_salary_currency?: string | null; job_salary_period?: string | null;
};

async function jsearch(title: string, place: Place): Promise<Found[]> {
  const key = process.env.JSEARCH_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ query: place.kind === "place" ? `${title} in ${place.name}` : title, page: "1", num_pages: "1", date_posted: "month" });
  if (place.kind === "remote") params.set("work_from_home", "true");
  // JSearch assumes the US without a country. Dreamwork and Himalayas already cover worldwide
  // and remote roles, so "Anywhere" and "Remote" use Google for the Indian market instead.
  params.set("country", place.kind === "place" ? (place.country ?? "us") : "in");
  const body = await getJson<{ data: { jobs: JSearchJob[] } }>(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
  });
  // Google's matching is loose (an "Account Executive" search brings accounting jobs), so keep titles holding the searched words.
  return (body.data?.jobs ?? []).filter((j) => titleMatches(title, j.job_title)).map((j) => ({
    source: "jsearch",
    id: j.job_id,
    title: j.job_title,
    company: j.employer_name,
    companyLogo: j.employer_logo ?? undefined,
    location: j.job_location || [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") || (j.job_is_remote ? "Remote" : "Not listed"),
    workSetting: j.job_is_remote ? "remote" : undefined,
    salary: j.job_min_salary && j.job_max_salary ? `${j.job_salary_currency ?? ""} ${j.job_min_salary.toLocaleString()} – ${j.job_max_salary.toLocaleString()}${j.job_salary_period ? `/${j.job_salary_period.toLowerCase()}` : ""}`.trim() : undefined,
    postedAt: j.job_posted_at_datetime_utc ?? undefined,
    url: j.job_apply_link,
    description: cut(j.job_description),
  }));
}

// ---------- Adzuna ----------

type AdzunaJob = {
  id: string; title: string; company?: { display_name?: string }; location?: { display_name?: string };
  description?: string; redirect_url: string; created?: string; salary_min?: number; salary_max?: number;
};

async function adzuna(title: string, place: Place): Promise<Found[]> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  // Adzuna searches one country at a time, so it only runs for a place we can pin to a country.
  if (!id || !key || place.kind !== "place" || !place.country) return [];
  const params = new URLSearchParams({ app_id: id, app_key: key, what: title, max_days_old: "30", results_per_page: "50", "content-type": "application/json" });
  if (!(place.name.toLowerCase() in COUNTRIES)) params.set("where", place.name);
  const body = await getJson<{ results: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/${place.country}/search/1?${params}`);
  return (body.results ?? []).filter((j) => titleMatches(title, htmlToText(j.title))).map((j) => ({
    source: "adzuna",
    id: j.id,
    title: htmlToText(j.title),
    company: j.company?.display_name ?? "Unknown company",
    location: j.location?.display_name ?? place.name,
    salary: j.salary_min && j.salary_max ? `${Math.round(j.salary_min).toLocaleString()} – ${Math.round(j.salary_max).toLocaleString()}/year` : undefined,
    postedAt: j.created,
    url: j.redirect_url,
    // Adzuna only gives the opening lines; the full text is on the employer's page.
    description: cut(j.description && htmlToText(j.description)),
  }));
}

// ---------- Himalayas (remote jobs, no key) ----------

type HimalayasJob = {
  title: string; companyName: string; companyLogo?: string; guid: string; applicationLink?: string;
  locationRestrictions?: string[]; minSalary?: number | null; maxSalary?: number | null; currency?: string | null;
  pubDate?: number; description?: string; excerpt?: string;
};

const COUNTRY_NAMES: Record<string, string> = { in: "india", us: "united states", gb: "united kingdom", de: "germany", fr: "france", nl: "netherlands", ca: "canada", au: "australia", sg: "singapore", nz: "new zealand", ae: "united arab emirates" };


async function himalayas(title: string, place: Place): Promise<Found[]> {
  const body = await getJson<{ jobs: HimalayasJob[] }>(`https://himalayas.app/jobs/api/search?${new URLSearchParams({ q: title })}`);
  const monthAgo = Date.now() / 1000 - 30 * 86_400;
  const wanted = place.kind === "place" ? [place.name.toLowerCase(), place.country && COUNTRY_NAMES[place.country]].filter(Boolean) : [];
  return (body.jobs ?? [])
    .filter((j) => titleMatches(title, j.title) && (!j.pubDate || j.pubDate >= monthAgo))
    // Every Himalayas job is remote; for a place, keep the ones open to it (no restriction means worldwide).
    .filter((j) => !wanted.length || !j.locationRestrictions?.length || j.locationRestrictions.some((r) => wanted.includes(r.toLowerCase())))
    .map((j) => ({
      source: "himalayas",
      id: j.guid,
      title: j.title,
      company: j.companyName,
      companyLogo: j.companyLogo || undefined,
      location: j.locationRestrictions?.length ? `Remote (${j.locationRestrictions.join(", ")})` : "Remote (Worldwide)",
      workSetting: "remote",
      salary: j.minSalary && j.maxSalary ? `${j.currency ?? ""} ${j.minSalary.toLocaleString()} – ${j.maxSalary.toLocaleString()}/year`.trim() : undefined,
      postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : undefined,
      url: j.guid,
      description: cut(j.description ? htmlToText(j.description) : j.excerpt),
    }));
}

// ---------- Hacker News "Who is hiring?" (monthly thread, no key) ----------

type HnItem = { id: number; author?: string | null; text?: string | null; created_at?: string; children?: HnItem[] };

// The thread is about 500 KB and the same for every track and user, so one copy is kept for six hours.
let hnThread: { at: number; posts: HnItem[] } | undefined;

async function hnPosts() {
  if (hnThread && Date.now() - hnThread.at < 6 * 3_600_000) return hnThread.posts;
  const found = await getJson<{ hits: { objectID: string; title: string }[] }>(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5",
  );
  const story = found.hits.find((h) => /who is hiring/i.test(h.title));
  if (!story) return [];
  const thread = await getJson<HnItem>(`https://hn.algolia.com/api/v1/items/${story.objectID}`);
  hnThread = { at: Date.now(), posts: (thread.children ?? []).filter((c) => c.text) };
  return hnThread.posts;
}

const hnText = (html: string) =>
  htmlToText(html.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))));

/**
 * Each top-level post starts with a header line like "Company | Role, Role | Location | REMOTE".
 * A post is kept when one header part holds the searched title and the header names a place open to the search.
 */
async function hackerNews(title: string, place: Place): Promise<Found[]> {
  const monthAgo = Date.now() - 31 * 86_400_000;
  return (await hnPosts()).flatMap((p): Found[] => {
    if (p.created_at && Date.parse(p.created_at) < monthAgo) return [];
    // HN opens paragraphs with <p> and never closes them, so the header is everything before the first one.
    const header = hnText((p.text ?? "").split(/<p>/i)[0]).replace(/\s+/g, " ");
    const parts = header.split(/\s+[|—–]\s+|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
    // One part often lists several roles: "Senior Java Engineer, Account Executive" or "Head of Sales / GTM".
    const role = parts.slice(1).flatMap((s) => s.split(/\s*[,/;]\s*(?![^(]*\))/)).find((s) => titleMatches(title, s));
    if (!role || !openTo(place, header)) return [];
    const text = hnText(p.text ?? "");
    const remote = /\bremote\b/i.test(header);
    return [{
      source: "hn",
      id: String(p.id),
      title: role,
      company: parts[0].replace(/\s*https?:\S+/g, "").slice(0, 80),
      location: parts.slice(1).filter((s) => !s.includes(role)).join(" | ").slice(0, 200),
      workSetting: remote ? "remote" : undefined,
      postedAt: p.created_at,
      url: `https://news.ycombinator.com/item?id=${p.id}`,
      description: cut(text),
    }];
  });
}

/** True when a role in this free-text location (or its title) is open to someone searching this place. */
export function openTo(place: Place, location: string, workSetting?: string, title = "") {
  if (place.kind === "anywhere") return true;
  const where = location.toLowerCase();
  // Some companies (Cloudflare) say "Distributed" for remote.
  const remote = workSetting === "remote" || /remote|distributed/.test(where);
  if (place.kind === "remote") return remote;
  if (place.country === "in" && !/^india$/i.test(place.name.trim())) return openToIndianCity(place.name, where, remote, title.toLowerCase());
  const country = place.country && COUNTRY_NAMES[place.country];
  const names = [...place.name.toLowerCase().split(",").map((p) => p.trim()), country, ...(place.country === "in" ? INDIA_CITIES : [])].filter((n): n is string => !!n);
  // Whole words, so "Indianapolis" isn't India. The place is often in the title: "Account Executive - India", "BDR - SAARC".
  const text = `${where} ${title.toLowerCase()}`;
  if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))) return true;
  if (place.country === "in" && /\bsaarc\b/.test(text)) return true;
  // A remote role counts only when it says it's open worldwide or to the region. Big companies
  // write plain "Remote" for roles that are really tied to one US state.
  return remote && /\b(worldwide|global|apac|apj|asia)\b/.test(where);
}

/**
 * For someone in one Indian city: that city, anywhere-in-India and India-open remote roles count,
 * but a role in another Indian city doesn't ("Indore, Madhya Pradesh, India" isn't Bengaluru).
 */
function openToIndianCity(name: string, where: string, remote: boolean, title: string) {
  const cities = name.toLowerCase().split(",").map((p) => p.trim()).filter(Boolean);
  const names = [...cities, ...cities.flatMap((c) => CITY_ALIASES[c] ?? [])];
  const text = `${where} ${title}`;
  if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))) return true;
  // Nothing said, or only "India" / "Remote, India" / "Pan India": open to the whole country.
  if (!where.trim() || where === "not listed") return /\b(india|saarc)\b/.test(title) || !title;
  const rest = where.replace(ANY_INDIA, "").replace(/[^a-z]+/g, "");
  if (!rest && (/\bindia\b/.test(where) || remote)) return /\bindia\b/.test(where) || /\b(india|saarc)\b/.test(title);
  if (/\bsaarc\b/.test(text)) return true;
  return remote && /\b(worldwide|global|apac|apj|asia)\b/.test(text);
}

/** Jobs from the other boards, and the names of any board that didn't answer. */
export async function searchOtherSources(titles: string[], location: string, googleTitles = 2): Promise<{ jobs: Found[]; failed: string[] }> {
  const place = readPlace(location);
  // JSearch's free plan is about 200 searches a month and Adzuna's about 2,500, so they take a few titles a day,
  // a different few each day, and every title gets its turn within the week.
  const day = Math.floor(Date.now() / 86_400_000);
  const turn = (n: number) => (titles.length <= n ? titles : Array.from({ length: n }, (_, i) => titles[(day * n + i) % titles.length]));
  const calls: [string, Promise<Found[]>][] = [
    ...turn(googleTitles).map((t): [string, Promise<Found[]>] => ["Google Jobs", jsearch(t, place)]),
    ...turn(4).map((t): [string, Promise<Found[]>] => ["Adzuna", adzuna(t, place)]),
    // Dreamwork, Himalayas and Hacker News are free, so they search every title; Google and Adzuna have quotas.
    ...titles.slice(0, 16).map((t): [string, Promise<Found[]>] => ["Himalayas", himalayas(t, place)]),
    ...titles.slice(0, 16).map((t): [string, Promise<Found[]>] => ["Hacker News", hackerNews(t, place)]),
  ];
  const settled = await Promise.allSettled(calls.map(([, call]) => call));
  const failed = new Set<string>();
  settled.forEach((r, i) => {
    if (r.status !== "rejected") return;
    console.warn("Job source failed:", calls[i][0], String(r.reason));
    failed.add(calls[i][0]);
  });
  return { jobs: settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])), failed: [...failed] };
}
