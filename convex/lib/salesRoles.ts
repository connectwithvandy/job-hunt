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
    name: "Sales and Business Development Leadership",
    color: "#C6FF3D",
    titles: [
      "Sales Development Manager",
      "SDR Manager",
      "BDR Manager",
      "Senior Manager Sales Development",
      "Head of Sales Development",
      "Director of Sales Development",
      "Inside Sales Manager",
      "SDR Team Lead",
      "Business Development Manager",
      "Head of Business Development",
      "Director of Business Development",
      "Senior Manager Business Development",
      "Outbound Sales Manager",
      "Business Development Lead",
      "VP Business Development",
      "AVP Business Development",
    ],
    pitch: "Builds and scales SDR teams across regions that beat pipeline targets.",
  },
  {
    key: "account-executive",
    name: "Account Executive",
    color: "#FB923C",
    titles: ["Account Executive", "Senior Account Executive", "Enterprise Account Executive", "Mid-Market Account Executive", "SMB Account Executive", "Commercial Account Executive", "Strategic Account Executive", "Full Cycle Account Executive", "Founding Account Executive", "Sales Executive"],
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
  bd: "business development",
  ldr: "lead development representative",
  mdr: "market development representative",
  adr: "account development representative",
  isr: "inside sales representative",
  ae: "account executive",
  kam: "key account manager",
  csm: "customer success manager",
  cro: "chief revenue officer",
  vp: "vice president",
  avp: "assistant vice president",
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

/** True when the job title holds every word searched for. Loose boards also match descriptions. */
export function titleMatches(searched: string, title: string) {
  // Short forms written out on both sides, so a search for "SDR" keeps "Sales Development Rep" and the other way round.
  const t = fullTitle(title);
  const words = fullTitle(searched).split(" ").filter((w) => w && !FILLER.has(w));
  // "Account Executive" isn't "Accounting Executive".
  if (/\baccount(ing|ant)/.test(t) && !/\baccount(ing|ant)/.test(words.join(" "))) return false;
  // A rep search leaves out the reps' team leads and managers; the leadership role finds those.
  if (!isLeader(words)) return words.every((w) => t.includes(w)) && !(words.includes("representative") && isLeader(t.split(" ")));
  // A leader search takes any leader word: "SDR Manager" also finds "Head of Sales Development" and
  // "Director, Sales Development". Leaders run the reps, so their titles rarely say "representative".
  return isLeader(t.split(" ")) && words.filter((w) => !LEADER.has(w) && w !== "representative" && w !== "team").every((w) => t.includes(w));
}

const FILLER = new Set(["of", "the", "and", "for", "&"]);
const LEADER = new Set(["manager", "managers", "head", "director", "lead", "leader", "leadership", "vice", "president", "chief", "supervisor"]);

/** Whether a title names a leader. "Lead Development Representative" is a rep who works leads, not a team lead. */
function isLeader(words: string[]) {
  return words.some((w, i) => LEADER.has(w) && !(w === "lead" && words[i + 1] === "development"));
}
