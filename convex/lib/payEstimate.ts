// A rough yearly pay range for an Indian sales job that lists no pay, read from its title and city.
// No AI and no lookups, so it costs nothing. Always shown as an estimate, never as the company's figure.
// Figures are fixed pay (before incentives) in lakhs of rupees a year, for tech and SaaS companies in big
// Indian cities. Set 20 Nov 2026 from common market ranges; adjust the table when real offers say otherwise.

import { remoteWords } from "./places";

type Band = { test: RegExp; low: number; high: number };

/** First match wins, so the more specific titles come first. AE kinds match in any word order ("AE, Commercial & SMB"). */
const BANDS: Band[] = [
  { test: /\b(chief revenue|chief sales|cro)\b/i, low: 80, high: 150 },
  { test: /\b(vp|vice president|svp)\b/i, low: 60, high: 120 },
  { test: /\b(country manager|general manager|country head)\b/i, low: 50, high: 100 },
  { test: /\b(avp|assistant vice president)\b/i, low: 40, high: 70 },
  { test: /\b(director|head of|head,|head -)\b/i, low: 40, high: 80 },
  { test: /\b(sdr|bdr|sales development|inside sales)\b.*\b(manager|lead)\b|\b(manager|lead)\b.*\b(sales development|sdr|bdr)\b/i, low: 18, high: 35 },
  { test: /^(?=.*\b(account executive|ae)\b)(?=.*\b(enterprise|strategic|named)\b)/i, low: 30, high: 60 },
  { test: /^(?=.*\b(account executive|ae)\b)(?=.*\bfounding\b)/i, low: 20, high: 40 },
  { test: /^(?=.*\b(account executive|ae)\b)(?=.*\bmid[- ]?market\b)/i, low: 18, high: 35 },
  { test: /^(?=.*\b(account executive|ae)\b)(?=.*\b(smb|commercial|inside|small business)\b)/i, low: 10, high: 20 },
  { test: /\b(account executive|ae)\b/i, low: 15, high: 30 },
  { test: /\b(solutions? (engineer|consultant|architect)|sales engineer|pre-?sales)\b/i, low: 15, high: 35 },
  { test: /\b(gtm|revenue operations|revops|sales operations|sales ops|founder'?s office|business operations|bizops)\b/i, low: 10, high: 25 },
  { test: /\b(partner|partnerships?|alliances?|channel)\b/i, low: 15, high: 30 },
  { test: /\b(key|strategic|enterprise|global) account manager\b/i, low: 15, high: 30 },
  { test: /\b(regional|area|zonal|territory) sales manager\b/i, low: 12, high: 25 },
  { test: /\b(sales manager|business development manager|bdm)\b|\bmanager\b.*\bbusiness development\b/i, low: 12, high: 25 },
  { test: /\b(account manager|customer success|renewals?)\b/i, low: 8, high: 18 },
  { test: /\b(sales team lead|team lead)\b/i, low: 12, high: 22 },
  { test: /\b(sales development|business development representative|lead development|market development|account development|sdr|bdr)\b/i, low: 5, high: 10 },
  { test: /\b(business development executive|bde|inside sales|sales executive|sales associate|sales representative|sales specialist)\b/i, low: 3.5, high: 7 },
  // "Executive - Retail Sales", "Executive : Account Management", "Sales Voice Executive".
  { test: /^(?=.*\bexecutives?\b)(?=.*\b(sales|business development|account management|relationship|retail)\b)/i, low: 3.5, high: 7 },
];

// Big tech cities, and India with no city named, pay the full band; named smaller cities a little less.
const BIG_CITY = /\b(bengaluru|bangalore|mumbai|navi mumbai|delhi|new delhi|ncr|gurugram|gurgaon|noida|hyderabad|pune|chennai)\b/i;
const OTHER_INDIA =
  /\b(india|kolkata|ahmedabad|jaipur|kochi|cochin|chandigarh|indore|lucknow|coimbatore|nagpur|surat|vadodara|bhubaneswar|patna|mangalore|mysore|mysuru|thiruvananthapuram|visakhapatnam|maharashtra|karnataka|telangana|tamil nadu|haryana|west bengal|gujarat|rajasthan|kerala|uttar pradesh|punjab|odisha)\b/i;

/** Rounds to whole lakhs, or half lakhs under 10. */
const round = (n: number) => (n < 10 ? Math.round(n * 2) / 2 : Math.round(n));

/**
 * The estimated range in lakhs a year, or null when the job isn't in India, is an internship, or has a
 * title the table doesn't cover. "Remote (India)" counts as a big city; a plain "Remote" doesn't count,
 * since a worldwide remote role could pay in any currency.
 */
export function payEstimate(job: { title: string; location: string }): { low: number; high: number } | null {
  // The title counts too: "Senior Territory Account Executive, Bengaluru" lists only "Hybrid" as its place.
  const place = `${remoteWords(job.location)} ${job.title}`;
  const smaller = place.replace(/\bindia\b/gi, "");
  const city = BIG_CITY.test(place) ? 1 : OTHER_INDIA.test(smaller) ? 0.8 : /\bindia\b/i.test(place) ? 1 : 0;
  if (!city) return null;
  if (/\b(intern|internship|trainee|apprentice)\b/i.test(job.title)) return null;
  const band = BANDS.find((b) => b.test.test(job.title));
  if (!band) return null;
  // Seniority words move the band for individual roles; leaders' bands already cover it.
  let level = 1;
  if (band.high <= 60) {
    if (/\b(senior|sr\.?)\b/i.test(job.title)) level = 1.3;
    else if (/\b(principal|staff)\b/i.test(job.title)) level = 1.5;
    else if (/\b(associate|junior|jr\.?|entry)\b/i.test(job.title)) level = 0.75;
  }
  return { low: round(band.low * level * city), high: round(band.high * level * city) };
}

/** "₹15–30 L/yr", in the same shape as listed pay so rows read alike. */
export function payEstimateText(job: { title: string; location: string }) {
  const e = payEstimate(job);
  return e ? `₹${e.low}–${e.high} L/yr` : null;
}
