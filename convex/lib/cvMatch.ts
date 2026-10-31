// A free "CV match", like Jobscan: which of the posting's important terms your CV already uses.
// No AI and no paid service: a fixed list of sales and GTM terms, plus phrases the posting repeats.
// Pure code with no Convex imports, so the page and the tests can both use it.

/** The parts of a CV that are read. Same shape as a saved CV, so a saved one can be passed straight in. */
export type CvLike = {
  headline: string;
  summary: string;
  experience: { company: string; role: string; blurb: string; bullets: string[] }[];
  education: { school: string; degree: string; detail: string; notes: string[] }[];
  certifications: { name: string; detail: string }[];
  skills: { technical: string[]; soft: string[] };
  extras: { title: string; items: { heading: string; text: string }[] }[];
};

export type MatchTerm = {
  /** How it's shown, like "Salesforce" or "pipeline generation". */
  label: string;
  /** How many times the posting mentions it. */
  count: number;
  /** A known sales/GTM term counts double a phrase the posting repeats. */
  weight: number;
};

export type CvMatch = {
  /** 0 to 100: the share of the posting's terms, by weight, that the CV uses. */
  score: number;
  covered: MatchTerm[];
  /** Most important first. */
  missing: MatchTerm[];
};

// Known sales and GTM terms. The first word is the label; the rest are spellings that mean exactly the same
// thing. Kept strict on purpose: SDR and BDR, or HubSpot and Salesforce, are not swapped for each other.
const TERMS: string[][] = [
  // Tools
  ["Salesforce", "sfdc", "salesforce.com"],
  ["HubSpot"],
  ["Outreach", "outreach.io"],
  ["Salesloft"],
  ["Apollo", "apollo.io"],
  ["ZoomInfo"],
  ["Sales Navigator", "linkedin sales navigator", "sales nav"],
  ["Gong", "gong.io"],
  ["Chorus", "chorus.ai"],
  ["Clari"],
  ["Lusha"],
  ["Clay"],
  ["Pipedrive"],
  ["Zoho CRM", "zoho"],
  ["Microsoft Dynamics", "dynamics 365", "ms dynamics"],
  ["Highspot"],
  ["Seismic"],
  ["Excel", "microsoft excel", "ms excel"],
  ["CRM", "crms"],
  // Methods
  ["MEDDICC", "meddic", "meddpicc"],
  ["BANT"],
  ["SPIN Selling"],
  ["Challenger", "challenger sale", "challenger selling"],
  ["Sandler"],
  ["Command of the Message"],
  ["Value selling", "value based selling", "value-based selling"],
  ["Solution selling"],
  ["Consultative selling", "consultative sales", "consultative approach"],
  ["Social selling"],
  ["Objection handling", "handling objections", "handle objections", "overcoming objections"],
  ["Account-based marketing", "abm", "account based marketing"],
  ["Account planning", "account plan", "account plans"],
  ["Territory planning", "territory plan", "territory plans"],
  ["Forecasting", "forecast", "forecasts", "forecast accuracy"],
  ["Pipeline generation", "pipeline gen", "generate pipeline", "generating pipeline", "build pipeline", "building pipeline", "pipeline building", "pipeline creation", "create pipeline", "creating pipeline"],
  ["Pipeline management", "manage pipeline", "managing pipeline"],
  ["Lead generation", "lead gen"],
  ["Lead qualification", "qualify leads", "qualifying leads", "qualification"],
  ["Prospecting", "prospect"],
  ["Cold calling", "cold call", "cold calls", "cold-calling"],
  ["Cold email", "cold emails", "cold emailing"],
  ["Cadences", "cadence", "sequences"],
  ["Discovery calls", "discovery call", "discovery meetings", "discovery"],
  ["Demos", "demo", "product demo"],
  ["Meetings booked", "book meetings", "booking meetings", "booked meetings", "set meetings", "setting meetings", "meeting setting"],
  ["Negotiation", "negotiate", "negotiating", "negotiations"],
  ["Closing", "close deals", "closing deals"],
  ["Full sales cycle", "full cycle", "full-cycle", "end to end sales cycle", "end-to-end sales cycle"],
  ["Sales cycle", "sales cycles"],
  ["Multi-threading", "multithreading", "multi threading", "multi-threaded", "multi threaded"],
  ["Stakeholder management", "stakeholders"],
  ["C-suite", "c-level", "c suite", "c level", "cxo", "cxos"],
  ["Upselling", "upsell", "up-sell", "upsells"],
  ["Cross-selling", "cross-sell", "cross sell", "cross selling"],
  ["Renewals", "renewal"],
  ["Churn"],
  ["Net revenue retention", "nrr"],
  ["New business", "new logo", "new logos", "net new"],
  ["Quota", "quotas", "quota attainment"],
  ["KPIs", "kpi"],
  ["Sales playbook", "playbook", "playbooks"],
  ["Sales enablement", "enablement"],
  ["Coaching", "coach"],
  ["Inbound"],
  ["Outbound"],
  ["Inside sales"],
  ["Field sales"],
  ["Channel sales", "channel partners", "channel partner"],
  ["Partnerships", "partnership"],
  ["Pre-sales", "presales", "pre sales"],
  ["Customer success"],
  ["Account management", "account manager", "account managers"],
  // Roles and teams
  ["SDR", "sdrs", "sales development representative", "sales development rep"],
  ["BDR", "bdrs", "business development representative", "business development rep"],
  ["Sales development"],
  ["Account Executive", "account executives", "ae", "aes"],
  ["RevOps", "revenue operations"],
  ["Sales operations", "sales ops"],
  ["GTM", "go-to-market", "go to market"],
  // Market and metrics
  ["SaaS", "software as a service"],
  ["B2B"],
  ["Enterprise"],
  ["Mid-market", "mid market", "midmarket"],
  ["SMB", "smbs", "small and medium businesses", "small and medium-sized businesses"],
  ["ICP", "ideal customer profile"],
  ["ARR", "annual recurring revenue"],
  ["MRR", "monthly recurring revenue"],
  ["ACV", "annual contract value"],
  ["Win rate", "win rates"],
  ["Conversion rate", "conversion rates"],
  ["APAC", "asia pacific", "asia-pacific"],
  ["EMEA"],
  ["ANZ", "australia and new zealand"],
  ["North America"],
  ["Middle East"],
  ["Southeast Asia", "south east asia", "south-east asia"],
  ["Fintech"],
  ["Cybersecurity", "cyber security"],
];

// Lines about perks, the law or how to apply say nothing about the work, so they're skipped.
const BOILERPLATE =
  /equal opportunit|\beeo\b|benefit|insurance|paid time off|\bpto\b|401k|parental leave|maternity|wellness|disabilit|veteran|gender|sexual orientation|religion|national origin|accommodation|privacy|personal data|we offer|perks|salary|compensation|stock option|\besop\b|vacation|holiday|background check|visa|sponsorship|recruitment fraud|apply now|how to apply|click apply/i;

/** A sentence that asks something of the candidate: a duty, a requirement or a skill. */
const ASKS = /\b(experience|you will|you'll|you ll|responsib|abilit|skill|knowledge|proficien|must|should|require|years|familiar|track record|own|manage|drive|build|partner|qualif|prospect|generate|book|close|exceed|meet|hit|work with|strong|proven|excellent|comfortable|hands on|hands-on|deep|habit)/i;

// Words that never start or end a useful phrase.
const STOP = new Set(
  (
    "a an and or but the of to in on at for from by with as is are was were be been being it its this that these those " +
    "you your we our us they their them he she his her i me my who whom which what when where why how will would can could " +
    "should may might must shall do does did done have has had having not no nor so than too very just also only own same " +
    "such into over under about above below up down out off again further then once here there all any both each few more most " +
    "other some per via etc eg ie e g i.e e.g like well plus within across through during before after between including " +
    "able ability strong good great excellent proven solid deep demonstrated track record plus preferred required requirement " +
    "experience year years month months role roles job position candidate candidates team teams work working company " +
    "opportunity opportunities day days week weeks new help ensure make based using use responsible responsibilities " +
    "skill skills knowledge understanding environment level levels key multiple various other others looking join us " +
    "next step steps fast paced world class ideal ideally wide range"
  ).split(" "),
);

// Light stemming so "deals" matches "deal" and "companies" matches "company". Both sides get the same treatment.
function stem(w: string) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Lowercase words, with dots inside names (apollo.io) and plus signs kept, hyphens split. */
function words(text: string) {
  return (text.toLowerCase().replace(/[‐-―]/g, "-").match(/[a-z0-9]+(?:[.+][a-z0-9]+)*\+?/g) ?? []).map((w) => ({ raw: w, key: stem(w) }));
}

const keyOf = (text: string) => words(text.replace(/-/g, " ")).map((w) => w.key).join(" ");

/** Every run of one to six words in the text, for quick lookups. */
function phraseSet(text: string) {
  const w = words(text.replace(/-/g, " ")).map((x) => x.key);
  const set = new Set<string>();
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 6 && i + n <= w.length; n++) set.add(w.slice(i, i + n).join(" "));
  return set;
}

/** Where a phrase (as stemmed words) starts in a list of stemmed words. */
function startsIn(keys: string[], phrase: string[]) {
  const at: number[] = [];
  for (let i = 0; i + phrase.length <= keys.length; i++) if (phrase.every((p, j) => keys[i + j] === p)) at.push(i);
  return at;
}

/** The posting's text without its perks, legal and how-to-apply lines. */
export function workText(description: string) {
  return description
    .split(/\n|(?<=[.!?])\s+|•|·|;/)
    .filter((s) => !BOILERPLATE.test(s))
    .join("\n");
}

/** Every word of the CV that says what you've done: headline, summary, roles, bullets, skills, education, extras. */
export function cvText(cv: CvLike) {
  return [
    cv.headline,
    cv.summary,
    ...cv.experience.flatMap((e) => [e.company, e.role, e.blurb, ...e.bullets]),
    ...cv.education.flatMap((e) => [e.school, e.degree, e.detail, ...e.notes]),
    ...cv.certifications.flatMap((c) => [c.name, c.detail]),
    ...cv.skills.technical,
    ...cv.skills.soft,
    ...cv.extras.flatMap((x) => [x.title, ...x.items.flatMap((i) => [i.heading, i.text])]),
  ].join("\n");
}

/**
 * The posting's important terms: known sales/GTM terms it mentions, plus two- and three-word phrases it
 * repeats. `company` keeps the employer's own name out of the phrases.
 */
export function postingTerms(description: string, company = ""): (MatchTerm & { keys: string[] })[] {
  const text = workText(description);
  // Sentence breaks stop a phrase from running across two lines.
  const raw = text.split("\n");
  const lines = raw.map((l) => words(l.replace(/-/g, " ")));
  const allKeys = lines.flatMap((l) => [...l.map((w) => w.key), "|"]);
  const known = new Set<string>();
  const termKeys = TERMS.map(([label, ...rest]) => [...new Set([label, ...rest].map(keyOf))]);
  termKeys.flat().forEach((k) => known.add(k));
  // Longest match wins each stretch of words, so "full sales cycle" isn't also "sales cycle", and
  // "discovery calls" isn't counted again as "discovery".
  const hits = termKeys.flatMap((keys, t) => keys.flatMap((k) => startsIn(allKeys, k.split(" ")).map((start) => ({ t, start, len: k.split(" ").length }))));
  const taken = new Set<number>();
  const counts = new Map<number, number>();
  for (const h of hits.sort((a, b) => b.len - a.len)) {
    const span = Array.from({ length: h.len }, (_, j) => h.start + j);
    if (span.some((i) => taken.has(i))) continue;
    span.forEach((i) => taken.add(i));
    counts.set(h.t, (counts.get(h.t) ?? 0) + 1);
  }
  const terms: (MatchTerm & { keys: string[] })[] = [...counts].map(([t, count]) => ({ label: TERMS[t][0], count, weight: 2, keys: termKeys[t] }));

  // Phrases the posting says at least twice, made of real words, not about the employer, and only from
  // sentences that ask for something: the company's own story and slogans ("a smarter, safer world") aren't skills.
  const own = new Set(words(company).map((w) => w.key));
  const seen = new Map<string, { label: string; count: number }>();
  for (const [li, line] of lines.entries()) {
    if (!ASKS.test(raw[li])) continue;
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= line.length; i++) {
        const run = line.slice(i, i + n);
        const first = run[0].key;
        const last = run[n - 1].key;
        if (STOP.has(first) || STOP.has(last) || STOP.has(run[0].raw) || STOP.has(run[n - 1].raw)) continue;
        if (run.some((w) => own.has(w.key) || /^\d/.test(w.key) || w.key.length < 2)) continue;
        const key = run.map((w) => w.key).join(" ");
        const hit = seen.get(key);
        if (hit) hit.count++;
        else seen.set(key, { label: run.map((w) => w.raw).join(" "), count: 1 });
      }
    }
  }
  // A phrase that is, or holds, a known term is already counted there.
  const holdsKnown = (key: string) => [...known].some((k) => ` ${key} `.includes(` ${k} `) || ` ${k} `.includes(` ${key} `));
  const repeated = [...seen.entries()]
    .filter(([key, p]) => p.count >= 2 && !holdsKnown(key))
    .sort((a, b) => b[1].count - a[1].count || b[0].split(" ").length - a[0].split(" ").length);
  // Keep the longer phrase when a shorter one sits inside it as often ("enterprise sales team" over "enterprise sales").
  const phrases: [string, { label: string; count: number }][] = [];
  for (const [key, p] of repeated) {
    if (phrases.some(([k, q]) => (` ${k} `.includes(` ${key} `) || ` ${key} `.includes(` ${k} `)) && q.count >= p.count)) continue;
    phrases.push([key, p]);
    if (phrases.length >= 8) break;
  }
  for (const [key, p] of phrases) terms.push({ label: p.label, count: p.count, weight: 1, keys: [key] });
  return terms;
}

/**
 * How well a CV matches a posting, Jobscan style. Each term is worth its weight, plus one more when the
 * posting says it three times or more; the score is the share of that the CV covers. Null when the posting
 * has too few terms to judge.
 */
export function cvMatch(description: string, cv: CvLike | string, company = ""): CvMatch | null {
  const terms = postingTerms(description, company);
  if (terms.length < 3) return null;
  const have = phraseSet(typeof cv === "string" ? cv : cvText(cv));
  const worth = (t: MatchTerm) => t.weight + (t.count >= 3 ? 1 : 0);
  const covered: MatchTerm[] = [];
  const missing: MatchTerm[] = [];
  let got = 0;
  let total = 0;
  for (const { keys, ...t } of terms) {
    total += worth(t);
    if (keys.some((k) => have.has(k))) {
      covered.push(t);
      got += worth(t);
    } else missing.push(t);
  }
  const order = (a: MatchTerm, b: MatchTerm) => worth(b) - worth(a) || b.weight - a.weight || b.count - a.count;
  return { score: Math.round((100 * got) / total), covered: covered.sort(order), missing: missing.sort(order) };
}
