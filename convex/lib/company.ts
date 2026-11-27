const NOISE = /\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|company|technologies|technology|tech|software|solutions|labs|group|india|global|the)\b/g;

/** "Thermo Fisher Scientific India Pvt Ltd" and "ThermoFisher" both start with "thermofisher". */
export function companyKey(name: string) {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(NOISE, " ").replace(/\s+/g, "");
}

/**
 * Rank who to ask first. A referral lands best from someone near the hiring team
 * (sales, revenue, GTM), senior enough to be heard, or in talent who can route it.
 */
export function referralRank(position: string) {
  const p = position.toLowerCase();
  let rank = 0;
  if (/(sales|revenue|gtm|go.to.market|business development|bdr|sdr|growth|account)/.test(p)) rank += 3;
  if (/(recruit|talent|people|hr\b|human resources)/.test(p)) rank += 2;
  if (/(vp|vice president|head|director|chief|cro|ceo|founder)/.test(p)) rank += 2;
  else if (/(manager|lead)/.test(p)) rank += 1;
  if (/(intern|student)/.test(p)) rank -= 2;
  return rank;
}

export function linkedInPeopleSearch(company: string, title: string) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${title} ${company}`)}`;
}

/** Same company and title, ignoring case and punctuation: one role seen on several boards or searches. */
export function roleKey(company: string, title: string) {
  return `${companyKey(company)}|${title.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

// Names some boards put in place of a hidden employer, or a page heading read as the company.
const NO_NAME =
  /^(important company of the sector|leading|leading company|leading (mnc|organi[sz]ation|client|firm)|nameless|confidential|undisclosed|company confidential|stealth|stealth startup|recognized|reputed (company|mnc|organi[sz]ation)|talent acquisition team|hiring team|recruitment team|our client|a client|client of .*|t\d{2,4})$/i;

/** A company name as a person would write it: escaped symbols put back, and hidden employers left blank. */
export function cleanCompany(name: string) {
  const fixed = name
    .replace(/\\?u0026/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    // Some boards repeat the name: "GoKwik GoKwik".
    .replace(/^(.+?) \1$/i, "$1");
  // A careers-site id with the legal suffix glued on: "Razorpaysoftwareprivatelimited" becomes "Razorpay".
  const glued = /^([a-z]{3,}?)(?:software|technologies|technology|solutions|services|india)?(?:privatelimited|pvtltd)$/i.exec(fixed);
  const named = glued ? glued[1][0].toUpperCase() + glued[1].slice(1).toLowerCase() : fixed;
  // A country code, or a tagline with several commas ("Rewards, Payouts, Perks, Loyalty & Engagement"), isn't a company.
  if (/^(us|usa|uk|in|india|global|remote)$/i.test(named) || (named.match(/,/g) ?? []).length >= 2) return "";
  return NO_NAME.test(named) ? "" : named;
}

// Short names for the same employer, so "HPE" and "Hewlett Packard Enterprise" count as one.
const ALIASES: Record<string, string> = { hpe: "hewlettpackardenterprise", gskcareers: "gsk", aws: "amazonwebservices" };

/**
 * A looser key than roleKey for spotting the same role listed twice: ignores the company's aside in
 * brackets ("Lyric (lyric.tech)") and places in brackets after the title ("… (Hybrid- Bangalore) (Bangalore East)").
 */
// Indian places and work settings a title can end with: "Enterprise AE | New Logo | Mumbai" and "… | Bangalore" are one
// role posted per city (27 Nov review: Jamf three times). Other countries stay apart: a UK role isn't an Australian one.
const TITLE_PLACE = /^(bengaluru|bangalore|mumbai|delhi|new delhi|ncr|delhi ncr|gurgaon|gurugram|noida|pune|chennai|hyderabad|kolkata|ahmedabad|kochi|jaipur|chandigarh|lucknow|indore|surat|nagpur|bhopal|coimbatore|kanpur|patna|vadodara|visakhapatnam|vizag|thane|navi mumbai|ludhiana|india|pan india|remote|hybrid|on-?site|east|west|north|south)$/;

export function sameRoleKey(company: string, title: string) {
  const c = companyKey(company.replace(/\(.*?\)/g, " "));
  const t = title
    // A store or requisition code at the end ("Sales Executive Fmb 02", "Sales Executive 1344") is one role per store.
    .replace(/(\s+[a-z]{0,4}\s?\d{1,5})+\s*$/i, "")
    .toLowerCase()
    .replace(/\((?:[^()]*\b(bengaluru|bangalore|india|remote|hybrid|on-?site|east|west|north|south)\b[^()]*)\)/g, " ")
    // Drop trailing "| Mumbai", " - Chennai/Hyderabad", ", Bengaluru" parts made only of Indian places.
    .split(/\s*[|–—]\s*|\s+-\s+|\s*,\s*/)
    .filter((part, i) => i === 0 || !part.split(/\s*\/\s*|\s+or\s+|\s*&\s*/).every((w) => TITLE_PLACE.test(w.trim())))
    .join(" ")
    .replace(/[^a-z0-9]/g, "");
  return `${ALIASES[c] ?? c}|${t}`;
}

/**
 * Job boards that repost other companies' roles under their own name (Jobgether, beBee). Their link opens the
 * board, not the employer, and the same role comes back under new ids: kept out of every list.
 */
// Job boards that repost others' roles, and recruiting agencies hiring for unnamed clients (added 17 Nov after a
// review of everyone's lists: HuntingCube, 2coms, "Hiring Specialist | BFSI…", SKS HR…). Agency-style names count too,
// but not "consultancy services" (that would catch Tata Consultancy Services).
export const AGGREGATORS =
  /\b(jobgether|bebee|talent\.com|jooble|careerjet|huntingcube|2coms|weekday ai|careerbloc|remotestar|corporate stalwarts|insight global|n human resources|headway tek|h3 technologies|hiring specialist|hr solutions?|human resources?|staffing|recruitment|recruiters?|placements?|manpower)\b/i;

/**
 * A company name that isn't one: a legal suffix alone ("LLP"), a placeholder ("Company not listed"), or a scrap of
 * sentence the board put in the company field ("due to several reasons."). Such listings look scraped and can't be
 * checked, so they're skipped when saved and hidden from lists (27 Nov 2026 review).
 */
export function junkCompany(name: string) {
  const n = name.trim();
  if (n.length < 2) return true;
  if (/^(llp|pvt|pvt\.? ltd\.?|ltd\.?|inc\.?|limited|private limited|company|careers?|n\/?a|none|null|undefined|unknown|confidential)$/i.test(n)) return true;
  if (/\b(not (listed|disclosed|mentioned|specified)|undisclosed|company name)\b/i.test(n)) return true;
  // A job board's name in the company slot means the employer is unknown ("Company not listed" on cards).
  if (/^(indeed(\.com|\.co\.in)?|naukri(\.com)?|foundit|monster|glassdoor|shine(\.com)?|timesjobs|linkedin jobs)$/i.test(n)) return true;
  const words = n.split(/\s+/);
  // Reads as a clause, or every word in lower case like a sentence: a company name doesn't ("boAt", "iMerit" are fine).
  if (/\b(due to|several|reasons?|because|we are|you will)\b/i.test(n)) return true;
  // A category, not an employer: "IT Training and Certification Courses".
  if (/\b(courses|certification courses|training and certification)\b/i.test(n)) return true;
  if (words.length >= 3 && words.every((w) => /^[a-z]/.test(w))) return true;
  // Ends with a full stop that isn't a legal suffix ("Ltd.", "Inc." are fine).
  if (/\.$/.test(n) && words.length >= 3 && !/\b(ltd|inc|co|corp|llc|plc|pvt|bros|ag|sa|bv)\.$/i.test(n)) return true;
  return false;
}

/**
 * A shop-floor retail job (owner, 27 Nov: "biba shouldnt be included"): sales staff in a store, mall or showroom,
 * or at a fashion, apparel or jewellery retail brand. JobPipe is for B2B sales people, so these are never saved
 * or shown.
 */
export function storeRetailJob(j: { company: string; title: string; location?: string }) {
  if (/\b(biba|w for woman|fabindia|westside|pantaloons|lifestyle stores|max fashion|reliance trends|tanishq|caratlane|kalyan jewellers|malabar gold|bluestone|lenskart|decathlon|ikea|croma|reliance digital)\b/i.test(j.company)) return true;
  if (/\b(apparel|fashion|boutique|jewel+e?rs?|retail stores?)\b/i.test(j.company)) return true;
  if (/\b(mall|showroom|outlet|store)\b/i.test(j.location ?? "")) return true;
  if (/\b(store|showroom|retail|floor|counter)\s+(sales|executive|associate|staff)\b|\bsales (associate|staff|girl|boy)\b|\bfashion consultant\b/i.test(j.title)) return true;
  return false;
}

// Job boards whose own page is a fine place to apply when the company's isn't known: since 13 Nov their
// listings are kept (most India SDR roles are only there). Reposting boards (AGGREGATORS) still aren't.
const APPLY_BOARDS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/i, "LinkedIn"],
  [/(^|\.)naukri\.com$/i, "Naukri"],
  [/(^|\.)indeed\.[a-z.]+$/i, "Indeed"],
  [/(^|\.)foundit\.[a-z.]+$/i, "Foundit"],
  [/(^|\.)instahyre\.com$/i, "Instahyre"],
  [/(^|\.)iimjobs\.com$/i, "iimjobs"],
  [/(^|\.)hirist\.[a-z.]+$/i, "Hirist"],
  [/(^|\.)cutshort\.io$/i, "Cutshort"],
  [/(^|\.)wellfound\.com$/i, "Wellfound"],
  [/(^|\.)glassdoor\.[a-z.]+$/i, "Glassdoor"],
  [/(^|\.)shine\.com$/i, "Shine"],
];

/** "Naukri" for a Naukri link: the job board a link opens, when it's one people apply through. Null otherwise. */
export function applyBoard(url?: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return APPLY_BOARDS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The application form itself, not the job's overview page. Ashby and Lever show the description first and keep
 * the form on its own page (/application, /apply), so Apply and the autofill bookmark used to land a click short
 * (found 23 Nov on CodeRabbit's Ashby posting). Other links come back unchanged.
 */
export function formLink(url?: string | null) {
  if (!url) return url ?? undefined;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.hostname === "jobs.ashbyhq.com" && parts.length === 2) u.pathname = `/${parts[0]}/${parts[1]}/application`;
    else if (/^jobs\.(eu\.)?lever\.co$/.test(u.hostname) && parts.length === 2) u.pathname = `/${parts[0]}/${parts[1]}/apply`;
    else return url;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * The employer a recruiter's posting is really for, when its text opens by naming another company ("Buildesk is a
 * fast-growing PropTech platform…" under Cravingcode): shown as "Hiring for Buildesk" so the header and the text
 * never disagree (27 Nov review). Null when the text doesn't clearly name a different company.
 */
export function hiringFor(description: string | undefined, company: string): string | null {
  if (!description) return null;
  // Only the first line counts, and words must sit on it with plain spaces: "About Us\n\nWe…" or a heading
  // like "Company Description" is never a company (28 Nov dry run found 600+ of those).
  const start = description.trim().slice(0, 300).split(/\r?\n/)[0];
  const word = "[A-Z][A-Za-z0-9&.'-]+";
  const nameRe = `(${word}(?: ${word}){0,2})`;
  const m = start.match(new RegExp(`^(?:About )?${nameRe} (?:is|are|was) (?:a|an|the|one|india's|a leading)\\b`)) ?? start.match(new RegExp(`^About ${nameRe} ?:`));
  if (!m) return null;
  const name = m[1].trim();
  const NOT_NAMES = /^(we|us|our|the|this|it|company|description|role|job|position|team|client|about|overview|summary|you|they|he|she|who|what|why|opportunity|responsibilities|requirements)$/i;
  if (name.split(" ").some((w) => NOT_NAMES.test(w))) return null;
  // Shouty headings ("ABOUT MORPHO") aren't trusted.
  if (name.length > 4 && name === name.toUpperCase() && !/\d|\./.test(name)) return null;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const [a, b] = [key(name), key(company)];
  if (!a || !b || a.includes(b) || b.includes(a) || a.slice(0, 5) === b.slice(0, 5)) return null;
  return name;
}
