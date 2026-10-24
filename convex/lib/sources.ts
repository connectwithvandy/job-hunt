"use node";

// Job boards searched beside Dreamwork. Each one switches on when its key is set
// on the deployment (npx convex env set NAME value). Himalayas needs no key.

export type Found = {
  source: "jsearch" | "adzuna" | "himalayas";
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  workSetting?: string;
  salary?: string;
  postedAt?: string;
  url: string;
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

const cut = (text?: string | null) => (text ? text.slice(0, 8000) : undefined);

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
  if (place.kind === "place" && place.country) params.set("country", place.country);
  const body = await getJson<{ data: { jobs: JSearchJob[] } }>(`https://jsearch.p.rapidapi.com/search-v2?${params}`, {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
  });
  // Google's matching is loose (an "Account Executive" search brings accounting jobs), so keep exact-phrase titles only.
  const phrase = title.toLowerCase();
  return (body.data?.jobs ?? []).filter((j) => j.job_title.toLowerCase().includes(phrase)).map((j) => ({
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
  const params = new URLSearchParams({ app_id: id, app_key: key, what: title, max_days_old: "30", results_per_page: "10", "content-type": "application/json" });
  if (!(place.name.toLowerCase() in COUNTRIES)) params.set("where", place.name);
  const body = await getJson<{ results: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/${place.country}/search/1?${params}`);
  return (body.results ?? []).map((j) => ({
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

/** True when the job title holds every word searched for. Loose boards also match descriptions. */
export function titleMatches(searched: string, title: string) {
  const t = title.toLowerCase();
  return searched.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean).every((w) => t.includes(w));
}

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

/** Searches every extra source for these titles. A source that fails is skipped, not fatal. */
export async function searchOtherSources(titles: string[], location: string, googleTitles = 2) {
  const place = readPlace(location);
  const calls = [
    // JSearch's free plan is about 200 searches a month, so it gets the two main titles only.
    ...titles.slice(0, googleTitles).map((t) => jsearch(t, place)),
    ...titles.slice(0, 4).map((t) => adzuna(t, place)),
    ...titles.slice(0, 4).map((t) => himalayas(t, place)),
  ];
  const settled = await Promise.allSettled(calls);
  for (const r of settled) if (r.status === "rejected") console.warn("Job source failed:", String(r.reason));
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
