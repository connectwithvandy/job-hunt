// The services JobPipe can't work without, checked with the smallest call each allows:
// a one-word AI reply, a one-job Dreamwork search, Apify's usage page, and our own count of Google Jobs searches.

export type ServiceFacts = {
  /** Null when the AI answered; otherwise why it didn't, like "credit balance is too low". */
  ai: string | null;
  dreamwork: string | null;
  /** Apify's spend this month against its limit, or why we couldn't read it. */
  apify: { used: number; limit: number } | { error: string } | null;
  google: { used: number; budget: number };
};

/** Apify past this share of its monthly credit gets a warning: the LinkedIn pool stops when it runs out. */
const APIFY_WARN = 0.9;

const money = (n: number) => `$${n.toFixed(2)}`;

/** True when something is down right now (not just a monthly allowance running low): worth an email of its own. */
export function servicesDown(f: ServiceFacts) {
  return !!f.ai || !!f.dreamwork || (!!f.apify && "error" in f.apify);
}

/** The SERVICES block for the owner's emails, with warnings first. */
export function servicesSection(f: ServiceFacts) {
  const apifyLow = f.apify && "used" in f.apify && f.apify.limit > 0 && f.apify.used >= f.apify.limit * APIFY_WARN;
  const googleOut = f.google.used >= f.google.budget;
  const warnings = [
    f.ai && `WARNING: the AI (Anthropic) isn't answering: ${f.ai}. Scoring and tailored CVs are failing for everyone. Check the key and credit at console.anthropic.com.`,
    f.dreamwork && `WARNING: Dreamwork isn't answering: ${f.dreamwork}. Morning searches will find fewer jobs.`,
    f.apify && "error" in f.apify && `WARNING: Apify (LinkedIn jobs) isn't answering: ${f.apify.error}.`,
    apifyLow && `WARNING: Apify has used ${money((f.apify as { used: number }).used)} of its ${money((f.apify as { limit: number }).limit)} this month. LinkedIn jobs stop when it runs out.`,
    googleOut && `WARNING: this month's Google Jobs searches are used up (${f.google.used} of ${f.google.budget}). No Google Jobs until the 1st.`,
  ].filter((w): w is string => !!w);
  const apifyLine = !f.apify ? "not set up" : "error" in f.apify ? "FAILED" : `working, ${money(f.apify.used)} of ${money(f.apify.limit)} used this month`;
  const text = [
    "SERVICES",
    ...warnings,
    `- AI (Anthropic): ${f.ai ? "FAILED" : "working"}`,
    `- Dreamwork: ${f.dreamwork ? "FAILED" : "working"}`,
    `- LinkedIn (Apify): ${apifyLine}`,
    `- Google Jobs: ${f.google.used} of ${f.google.budget} searches used this month`,
  ].join("\n");
  return { text, alarm: warnings.length > 0 };
}
