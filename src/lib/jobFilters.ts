// Filters for the Jobs list, modelled on Dreamwork's: each reads one URL parameter.

type FilterableJob = {
  title: string;
  company: string;
  workSetting?: string | null;
  postedAt?: string | null;
  salary?: string | null;
  source: string;
  scores?: { trackKey: string; score: number }[] | null;
};

type Filter = { key: string; label: string; options: { value: string; label: string; test: (j: FilterableJob, role: string | null) => boolean }[] };

const DAY = 86_400_000;
const postedWithin = (days: number) => (j: FilterableJob) => !!j.postedAt && Date.now() - Date.parse(j.postedAt) <= days * DAY;
/** The fit score for one role when a role is picked, else the best across roles. -1 when not scored. */
export const fitFor = (j: Pick<FilterableJob, "scores">, role: string | null) =>
  role ? (j.scores?.find((s) => s.trackKey === role)?.score ?? -1) : Math.max(-1, ...(j.scores ?? []).map((s) => s.score));

/** Seniority read from the title, since most boards don't send it. */
export function seniorityOf(title: string) {
  const t = title.toLowerCase();
  if (/\b(vp|vice president|chief|head of|director|cro|cxo)\b/.test(t)) return "director";
  if (/\b(manager|lead|leader|principal|staff)\b/.test(t)) return "manager";
  if (/\b(senior|sr\.?|enterprise|strategic)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|associate|intern|trainee|entry)\b/.test(t)) return "junior";
  return "mid";
}

export const FILTERS: Filter[] = [
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
    options: [{ value: "listed", label: "Pay listed", test: (j) => !!j.salary }],
  },
  {
    key: "fit",
    label: "Fit",
    options: [
      { value: "strong", label: "Strong fit (70+)", test: (j, role) => fitFor(j, role) >= 70 },
      { value: "ok", label: "Worth a look (50+)", test: (j, role) => fitFor(j, role) >= 50 },
      { value: "unscored", label: "Not scored yet", test: (j, role) => fitFor(j, role) < 0 },
    ],
  },
  {
    key: "source",
    label: "Source",
    options: [
      { value: "dreamwork", label: "Dreamwork", test: (j) => j.source === "dreamwork" },
      { value: "jsearch", label: "Google Jobs", test: (j) => j.source === "jsearch" },
      { value: "himalayas", label: "Himalayas", test: (j) => j.source === "himalayas" },
      { value: "added", label: "Added by me", test: (j) => j.source === "link" || j.source === "pasted" },
    ],
  },
];

/** Applies the keyword box and every filter set in the URL. */
export function applyFilters<J extends FilterableJob>(jobs: J[], params: URLSearchParams) {
  const words = (params.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const tests = FILTERS.flatMap((f) => f.options.filter((o) => o.value === params.get(f.key)).map((o) => o.test));
  return jobs.filter((j) => {
    const text = `${j.title} ${j.company}`.toLowerCase();
    return words.every((w) => text.includes(w)) && tests.every((t) => t(j, params.get("track")));
  });
}
