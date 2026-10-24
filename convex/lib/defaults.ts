// Starter tracks offered during onboarding. People pick the ones they want and can add their own.
export const PRESET_TRACKS = [
  {
    key: "sdr-leadership",
    name: "Sales Development Leadership",
    color: "#C6FF3D",
    titles: ["Sales Development Manager", "Senior Manager Sales Development", "Head of Sales Development", "BDR Manager"],
    pitch: "Builds and scales SDR teams across regions that beat pipeline targets.",
  },
  {
    key: "ai-gtm",
    name: "AI GTM",
    color: "#38BDF8",
    titles: ["GTM Engineer", "AI GTM", "Growth Engineer Sales", "GTM Automation"],
    pitch: "A sales leader who builds the AI workflows that make reps faster.",
  },
  {
    key: "gtm-strategy",
    name: "GTM Strategy",
    color: "#F472B6",
    titles: ["GTM Strategy", "Revenue Operations", "Founder's Office GTM", "Founder's Office", "Business Operations"],
    pitch: "Fixes funnels with data: conversion, territory and handoff design.",
  },
  {
    key: "account-executive",
    name: "Account Executive",
    color: "#FB923C",
    titles: ["Account Executive", "Senior Account Executive", "Enterprise Account Executive"],
    pitch: "Knows the full cycle from first call to close, and how pipeline is really built.",
  },
];

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
} as const;

/** Quick picks for where to search. "Remote" and "Anywhere" aren't places, so the search maps them to filters. */
export const LOCATION_CHOICES = [
  { value: "India", hint: "Jobs in India, plus remote jobs open to India" },
  { value: "Remote", hint: "Remote jobs in any country" },
  { value: "Anywhere", hint: "Any job, any country" },
];
