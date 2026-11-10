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
  { value: "India", label: "Anywhere in India", hint: "Jobs anywhere in India, plus remote jobs open to India" },
  { value: "Remote", label: "Remote only", hint: "Remote jobs in any country" },
  { value: "United States", label: "United States", hint: "Jobs in the US, plus remote jobs open to the US" },
  { value: "Anywhere", label: "Anywhere in the world", hint: "Any job, any country" },
];
