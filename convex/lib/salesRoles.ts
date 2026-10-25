// Every kind of sales job JobPipe covers, with the different names companies use for each.
// Offered when picking roles; the short forms below also let "SDR" match "Sales Development Representative".

export const SALES_ROLES = [
  {
    key: "sdr",
    name: "SDR / BDR",
    color: "#A78BFA",
    titles: [
      "Sales Development Representative",
      "SDR",
      "Business Development Representative",
      "BDR",
      "Business Development Executive",
      "Inside Sales Representative",
      "Inside Sales Executive",
      "Lead Development Representative",
      "Market Development Representative",
      "Account Development Representative",
      "Outbound Sales Representative",
    ],
    pitch: "Books meetings that turn into real pipeline, and keeps the activity numbers up.",
  },
  {
    key: "sdr-leadership",
    name: "Sales Development Leadership",
    color: "#C6FF3D",
    titles: ["Sales Development Manager", "SDR Manager", "BDR Manager", "Senior Manager Sales Development", "Head of Sales Development", "Director of Sales Development", "Inside Sales Manager", "SDR Team Lead"],
    pitch: "Builds and scales SDR teams across regions that beat pipeline targets.",
  },
  {
    key: "account-executive",
    name: "Account Executive",
    color: "#FB923C",
    titles: ["Account Executive", "Senior Account Executive", "Enterprise Account Executive", "Mid-Market Account Executive", "SMB Account Executive", "Commercial Account Executive", "Strategic Account Executive", "Sales Executive"],
    pitch: "Knows the full cycle from first call to close, and how pipeline is really built.",
  },
  {
    key: "account-management",
    name: "Account Management",
    color: "#34D399",
    titles: ["Account Manager", "Key Account Manager", "Strategic Account Manager", "Enterprise Account Manager", "Renewals Manager", "Customer Success Manager"],
    pitch: "Grows existing customers: renewals, upsell and expansion.",
  },
  {
    key: "sales-leadership",
    name: "Sales Leadership",
    color: "#F87171",
    titles: ["Sales Manager", "Regional Sales Manager", "Area Sales Manager", "Head of Sales", "Director of Sales", "VP Sales", "Country Manager", "Chief Revenue Officer"],
    pitch: "Leads sales teams to a number: hiring, coaching, forecasting and territory planning.",
  },
  {
    key: "partnerships",
    name: "Partnerships and Business Development",
    color: "#FACC15",
    titles: ["Business Development Manager", "Partner Manager", "Channel Sales Manager", "Alliances Manager", "Partnerships Manager", "Head of Partnerships"],
    pitch: "Opens new revenue through partners, channels and new markets.",
  },
  {
    key: "presales",
    name: "Pre-sales and Solutions",
    color: "#60A5FA",
    titles: ["Solutions Engineer", "Sales Engineer", "Presales Consultant", "Solutions Consultant", "Presales Engineer"],
    pitch: "Wins the technical side of the deal: demos, proofs of concept and solution design.",
  },
  {
    key: "gtm-strategy",
    name: "GTM Strategy and RevOps",
    color: "#F472B6",
    titles: ["GTM Strategy", "Revenue Operations", "Sales Operations", "Founder's Office GTM", "Founder's Office", "Business Operations"],
    pitch: "Fixes funnels with data: conversion, territory and handoff design.",
  },
  {
    key: "ai-gtm",
    name: "AI GTM",
    color: "#38BDF8",
    titles: ["GTM Engineer", "AI GTM", "Growth Engineer Sales", "GTM Automation"],
    pitch: "A sales leader who builds the AI workflows that make reps faster.",
  },
];

/** Short forms companies put in job titles, written out, so a search for one finds the other. */
const SHORT_FORMS: Record<string, string> = {
  sdr: "sales development representative",
  bdr: "business development representative",
  bde: "business development executive",
  bdm: "business development manager",
  ldr: "lead development representative",
  mdr: "market development representative",
  adr: "account development representative",
  isr: "inside sales representative",
  ae: "account executive",
  kam: "key account manager",
  csm: "customer success manager",
  cro: "chief revenue officer",
  vp: "vice president",
  rep: "representative",
  sr: "senior",
  mgr: "manager",
  exec: "executive",
  biz: "business",
  gtm: "go to market",
  revops: "revenue operations",
  ops: "operations",
};

/** A title in lowercase words, with short forms written out: "Sr. SDR" becomes "senior sales development representative". */
export function fullTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/go-to-market/g, "go to market")
    .split(/[^a-z0-9']+/)
    .filter(Boolean)
    .map((w) => SHORT_FORMS[w] ?? w)
    .join(" ");
}
