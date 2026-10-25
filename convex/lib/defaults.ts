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

/** Daily allowance per person, so a public app can't run up an unbounded AI bill. */
export const DAILY_LIMITS = {
  readCv: 5,
  score: 30,
  tailor: 3,
  notes: 10,
  addJob: 20,
  research: 10,
  prep: 5,
  chat: 60,
  search: 20,
} as const;

/** Quick picks for where to search. "Remote" and "Anywhere" aren't places, so the search maps them to filters. */
export const LOCATION_CHOICES = [
  { value: "Bengaluru", hint: "Jobs in Bengaluru, plus remote jobs open to India" },
  { value: "India", hint: "Jobs in India, plus remote jobs open to India" },
  { value: "Remote", hint: "Remote jobs in any country" },
  { value: "Anywhere", hint: "Any job, any country" },
];
