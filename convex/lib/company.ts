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
