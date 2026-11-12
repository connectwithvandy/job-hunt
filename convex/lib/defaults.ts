import { SALES_ROLES } from "./salesRoles";

// Starter tracks offered during onboarding: every kind of sales job. People pick the ones they want and can add their own.
export const PRESET_TRACKS = SALES_ROLES;

export const CUSTOM_COLORS = ["#A78BFA", "#34D399", "#FACC15", "#F87171", "#60A5FA"];

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  applying: "Getting ready",
  applied: "Applied",
  screening: "Screening",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Closed",
  dismissed: "Not for me",
};

export const PIPELINE: { status: string; label: string }[] = [
  { status: "applying", label: "Getting ready" },
  { status: "applied", label: "Applied" },
  { status: "screening", label: "Screening" },
  { status: "interview", label: "Interviewing" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Closed" },
];

/** Story bank size: enough for every common interview question, few enough to know by heart. */
export const MAX_STORIES = 20;

/** Daily allowance per person, so a public app can't run up an unbounded AI bill. */
/** AI scores each person gets from the morning run. */
export const AUTOPILOT_SCORES = 24;

/** New roles scored for one person each time the careers boards are read during the day. */
export const FRESH_SCORES = 3;

/** Fit that earns an alert straight away: the same line as a strong fit everywhere else. */
export const FRESH_FIT = 75;

/** Fresh job alerts one person can get in a day, so they stay worth opening. */
export const FRESH_PER_DAY = 3;

export const DAILY_LIMITS = {
  readCv: 5,
  score: 45,
  tailor: 3,
  notes: 10,
  addJob: 20,
  research: 10,
  prep: 5,
  chat: 60,
  search: 20,
  /** Hunter.io's free plan is about 50 emails a month for the whole app, so each person gets a few a day. */
  findEmail: 3,
} as const;

/** Quick picks for where to search. "Remote" and "Anywhere" aren't places, so the search maps them to filters. */
/** Cities offered as one-tap picks. People can pick several, and type any other city. */
export const CITY_CHOICES = ["Bengaluru", "Mumbai", "Delhi NCR", "Hyderabad", "Pune", "Chennai"];

/** Wider choices: picking one replaces the cities. */
export const LOCATION_CHOICES = [
  { value: "India", label: "Anywhere in India" },
  { value: "United States", label: "United States" },
  { value: "Anywhere", label: "Anywhere in the world" },
];

/** How the job is worked, like the On-site / Hybrid / Remote filter on job sites. People pick any of them. */
export const WORK_MODES = [
  { value: "onsite", label: "In office" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;
export type WorkMode = (typeof WORK_MODES)[number]["value"];
export const ALL_MODES: WorkMode[] = WORK_MODES.map((m) => m.value);

/**
 * The saved place and work types. Before 12 Nov 2026 "Remote" was a place of its own; it now means
 * anywhere in the world with only remote work, and is still saved as "Remote" because the search reads it that way.
 * All three work types are saved as nothing (no filter).
 */
export function readWorkModes(location: string, saved?: string[]): WorkMode[] {
  if (saved?.length) return ALL_MODES.filter((m) => saved.includes(m));
  return /^remote$/i.test(location.trim()) ? ["remote"] : ALL_MODES;
}

export function normalizePlace(location: string, modes?: string[]): { location: string; workModes?: WorkMode[] } {
  let place = location.trim() || "India";
  const picked = modes?.length ? ALL_MODES.filter((m) => modes.includes(m)) : readWorkModes(place);
  if (/^remote$/i.test(place)) place = "Anywhere";
  if (place === "Anywhere" && picked.length === 1 && picked[0] === "remote") place = "Remote";
  return { location: place, workModes: picked.length && picked.length < ALL_MODES.length ? picked : undefined };
}

/** How a listing is worked. A listing that doesn't say is most often in an office, sometimes hybrid. */
export function jobMode(location: string, workSetting?: string, title = ""): WorkMode | "unknown" {
  const s = (workSetting ?? "").toLowerCase();
  const text = `${location} ${title}`.toLowerCase();
  if (s.includes("remote") || /\b(remote|distributed|work from home|wfh)\b/.test(text)) return "remote";
  if (s.includes("hybrid") || /\bhybrid\b/.test(text)) return "hybrid";
  if (/on.?site|office/.test(s)) return "onsite";
  return "unknown";
}

/** Whether a listing's work type is one the person picked. */
export function fitsModes(modes: WorkMode[] | undefined, location: string, workSetting?: string, title = "") {
  if (!modes?.length || modes.length >= ALL_MODES.length) return true;
  const mode = jobMode(location, workSetting, title);
  if (mode === "unknown") return modes.includes("onsite") || modes.includes("hybrid");
  return modes.includes(mode);
}
