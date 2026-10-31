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
    .trim();
  return NO_NAME.test(fixed) ? "" : fixed;
}

// Short names for the same employer, so "HPE" and "Hewlett Packard Enterprise" count as one.
const ALIASES: Record<string, string> = { hpe: "hewlettpackardenterprise", gskcareers: "gsk", aws: "amazonwebservices" };

/**
 * A looser key than roleKey for spotting the same role listed twice: ignores the company's aside in
 * brackets ("Lyric (lyric.tech)") and places in brackets after the title ("… (Hybrid- Bangalore) (Bangalore East)").
 */
export function sameRoleKey(company: string, title: string) {
  const c = companyKey(company.replace(/\(.*?\)/g, " "));
  const t = title
    .toLowerCase()
    .replace(/\((?:[^()]*\b(bengaluru|bangalore|india|remote|hybrid|on-?site|east|west|north|south)\b[^()]*)\)/g, " ")
    .replace(/[^a-z0-9]/g, "");
  return `${ALIASES[c] ?? c}|${t}`;
}
