// Filters for the Jobs list: each reads one URL parameter.

import { SKIP_BELOW } from "../../convex/lib/posting";
import { titleMatches } from "../../convex/lib/salesRoles";

type FilterableJob = {
  title: string;
  company: string;
  workSetting?: string | null;
  postedAt?: string | null;
  salary?: string | null;
  source: string;
  scores?: { trackKey: string; score: number }[] | null;
  favorite?: boolean | null;
};

type Filter = { key: string; label: string; options: { value: string; label: string; test: (j: FilterableJob, role: string | null) => boolean }[] };

const DAY = 86_400_000;
const postedWithin = (days: number) => (j: FilterableJob) => !!j.postedAt && Date.now() - Date.parse(j.postedAt) <= days * DAY;
/** The fit score for one role when a role is picked, else the best across roles. -1 when not scored. */
export const fitFor = (j: Pick<FilterableJob, "scores">, role: string | null) =>
  role ? (j.scores?.find((s) => s.trackKey === role)?.score ?? -1) : Math.max(-1, ...(j.scores ?? []).map((s) => s.score));

/**
 * Where a job sorts by fit, from its AI score (-1 when not scored): AI scores at the line or above first,
 * then jobs with only a first guess, then AI scores below the line. A first guess never outranks a good AI score.
 */
export const fitTier = (aiScore: number) => (aiScore < 0 ? 1 : aiScore >= SKIP_BELOW ? 2 : 0);

export { seniorityOf } from "../../convex/lib/jobPrefs";
import { seniorityOf } from "../../convex/lib/jobPrefs";

export const FILTERS: Filter[] = [
  {
    key: "fav",
    label: "Favourites",
    options: [{ value: "yes", label: "Favourites only", test: (j) => !!j.favorite }],
  },
  {
    key: "setting",
    label: "Work setting",
    options: [
      { value: "remote", label: "Remote", test: (j) => j.workSetting === "remote" },
      { value: "hybrid", label: "Hybrid", test: (j) => j.workSetting === "hybrid" },
      { value: "onsite", label: "On-site", test: (j) => j.workSetting === "onsite" || !j.workSetting },
    ],
  },
  {
    key: "level",
    label: "Seniority",
    options: [
      { value: "director", label: "Director and up", test: (j) => seniorityOf(j.title) === "director" },
      { value: "manager", label: "Manager or lead", test: (j) => seniorityOf(j.title) === "manager" },
      { value: "senior", label: "Senior", test: (j) => seniorityOf(j.title) === "senior" },
      { value: "mid", label: "Mid-level", test: (j) => seniorityOf(j.title) === "mid" },
      { value: "junior", label: "Junior", test: (j) => seniorityOf(j.title) === "junior" },
    ],
  },
  {
    key: "posted",
    label: "Date posted",
    options: [
      { value: "1", label: "Last 24 hours", test: postedWithin(1) },
      { value: "3", label: "Last 3 days", test: postedWithin(3) },
      { value: "7", label: "Last week", test: postedWithin(7) },
      { value: "30", label: "Last month", test: postedWithin(30) },
    ],
  },
  {
    key: "pay",
    label: "Pay",
    options: [{ value: "listed", label: "Pay listed", test: (j) => !!j.salary && !/\best\b|estimat/i.test(j.salary) }],
  },
  {
    key: "fit",
    label: "Fit",
    options: [
      { value: "strong", label: "Strong fit (75+)", test: (j, role) => fitFor(j, role) >= 75 },
      { value: "ok", label: "Good fit (60+)", test: (j, role) => fitFor(j, role) >= 60 },
      { value: "under", label: "Under 60", test: (j, role) => fitFor(j, role) >= 0 && fitFor(j, role) < 60 },
      { value: "unscored", label: "Not scored yet", test: (j, role) => fitFor(j, role) < 0 },
    ],
  },
  {
    key: "source",
    label: "Source",
    options: [
      { value: "boards", label: "Job boards", test: (j) => ["dreamwork", "jsearch", "adzuna", "himalayas", "hn"].includes(j.source) },
      { value: "email", label: "From my email", test: (j) => j.source === "email" },
      { value: "linkedin", label: "LinkedIn", test: (j) => j.source === "linkedin" || j.source === "post" },
      { value: "careers", label: "Company careers pages", test: (j) => j.source === "careers" },
      { value: "added", label: "Added by me", test: (j) => j.source === "link" || j.source === "pasted" },
    ],
  },
];

/** The values picked for one filter: several can be on together ("remote,hybrid"), like Dreamwork's chips. */
export const picks = (params: URLSearchParams, key: string) => (params.get(key) ?? "").split(",").filter(Boolean);

/** The URL value after a chip is clicked: on if it was off, off if it was on. Null when nothing is left. */
export function togglePick(params: URLSearchParams, key: string, value: string) {
  const now = picks(params, key);
  const next = now.includes(value) ? now.filter((v) => v !== value) : [...now, value];
  return next.length ? next.join(",") : null;
}

/** Applies the keyword box and every filter set in the URL. Within a filter any picked option passes; across filters all must. */
export function applyFilters<J extends FilterableJob>(jobs: J[], params: URLSearchParams) {
  const words = (params.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const groups = FILTERS.map((f) => f.options.filter((o) => picks(params, f.key).includes(o.value)).map((o) => o.test)).filter((g) => g.length);
  return jobs.filter((j) => {
    const text = `${j.title} ${j.company}`.toLowerCase();
    return words.every((w) => text.includes(w)) && groups.every((g) => g.some((t) => t(j, params.get("track"))));
  });
}

/** Whether a job belongs to a role: its title matches one of the role's job titles the way the search does, or you applied as that role. */
export function inRole(job: { title: string; trackKey?: string | null }, role: { key: string; titles: string[] }) {
  if (job.trackKey === role.key) return true;
  return role.titles.some((t) => titleMatches(t, job.title));
}

/**
 * Titles outside B2B sales that a role's words still catch: assistants, and shop-floor, hotel and food sales
 * ("Executive Assistant – Sales", "Catering Sales Executive", "Jewellery Sales Executive"). They move to
 * "looser matches" on Jobs and stay off Today; nothing is deleted (27 Nov review).
 */
export const offTarget = (title: string, company = "") =>
  /\b(hospitals?|clinics?|healthcare services|educational|education consultants|school|jewel+e?rs?|apparel|fashion|boutique)\b/i.test(company) ||
  /\b(assistant|food\s*(?:&|and)\s*beverage|f\s*&\s*b|catering|banquet|jewel+e?ry|jewellery|showroom|retail store|store sales|counter sales|decor|furniture|hotel|restaurant|real estate site|telecaller|tele-?calling|retail sales|retail|marketing executive|research executive|intelligence & research|hospital|pharma(?:ceutical)? sales|medical representative|admissions?|counsellor|counselor|metals?|steel|cement|chemicals)\b/i.test(title);
