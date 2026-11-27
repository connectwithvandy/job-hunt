import { cityInTitle, tidyPlace } from "./tidy";
import { inBengaluru, remoteForIndia } from "../../convex/lib/places";

// Sorts a job's free-text location into broad regions for the Jobs page filter.
// A job can sit in more than one, like a remote role open to India.

export const REGIONS = [
  { key: "blr", label: "Bengaluru or remote" },
  { key: "india", label: "India" },
  { key: "remote", label: "Remote" },
  { key: "us", label: "US & Canada" },
  { key: "europe", label: "UK & Europe" },
  { key: "mideast", label: "Middle East" },
  { key: "apac", label: "Asia Pacific" },
  { key: "other", label: "Other" },
] as const;

export type RegionKey = (typeof REGIONS)[number]["key"];

const PLACES: Record<Exclude<RegionKey, "remote" | "other" | "blr">, string[]> = {
  india: ["india", "bengaluru", "bangalore", "mumbai", "delhi", "gurugram", "gurgaon", "noida", "pune", "hyderabad", "chennai", "kolkata", "ahmedabad", "jaipur", "kochi", "chandigarh", "indore", "maharashtra", "karnataka", "telangana", "tamil nadu", "haryana"],
  us: ["united states", "usa", "us", "canada", "new york", "san francisco", "seattle", "austin", "boston", "chicago", "los angeles", "denver", "atlanta", "miami", "washington", "toronto", "vancouver", "montreal"],
  europe: ["united kingdom", "uk", "england", "scotland", "london", "manchester", "ireland", "dublin", "germany", "berlin", "munich", "france", "paris", "netherlands", "amsterdam", "spain", "madrid", "barcelona", "portugal", "lisbon", "italy", "milan", "poland", "warsaw", "sweden", "stockholm", "denmark", "copenhagen", "switzerland", "zurich", "belgium", "austria", "vienna", "europe", "emea"],
  mideast: ["uae", "united arab emirates", "dubai", "abu dhabi", "saudi", "riyadh", "qatar", "doha", "israel", "tel aviv", "bahrain", "kuwait", "oman", "middle east"],
  apac: ["singapore", "australia", "sydney", "melbourne", "new zealand", "japan", "tokyo", "hong kong", "malaysia", "kuala lumpur", "indonesia", "jakarta", "philippines", "manila", "vietnam", "thailand", "bangkok", "korea", "seoul", "apac", "asia"],
};

const PATTERNS = Object.fromEntries(
  Object.entries(PLACES).map(([key, words]) => [key, new RegExp(`\\b(${words.join("|")})\\b`, "i")]),
) as Record<keyof typeof PLACES, RegExp>;

// "Austin, TX" style: a two-letter US state code after a comma.
const US_STATE = /,\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\b/;

// The market or territory a title names in its tail or brackets: "Account Executive - US", "AE (AU, NZ)", "SDR (Gujarat)".
// Read only there, so "Join us" or "US clients" in a long title don't count.
const TITLE_ABROAD: [RegionKey, RegExp][] = [
  ["us", /^(us|usa|united states|north america|namer|na|canada|us\s*&\s*canada)$/i],
  ["europe", /^(uk|uk&i|ukI|emea|europe|dach|nordics|benelux|france|germany|spain|italy|ireland)$/i],
  ["mideast", /^(uae|ksa|gcc|mena|middle east|saudi|saudi arabia|qatar|dubai)$/i],
  ["apac", /^(apac|anz|au|nz|aus|australia|new zealand|sea|south east asia|singapore|japan|asean)$/i],
];
// Indian places that aren't Bengaluru: a role "(Gujarat)" or "- Mumbai" isn't a Bengaluru role.
const OTHER_INDIA = /^(gujarat|ahmedabad|mumbai|maharashtra|pune|delhi|new delhi|ncr|delhi ncr|gurgaon|gurugram|noida|hyderabad|telangana|chennai|tamil nadu|kolkata|west bengal|kerala|kochi|rajasthan|jaipur|punjab|chandigarh|uttar pradesh|lucknow|madhya pradesh|indore|odisha|andhra pradesh|north india|west india|east india)$/i;

function titleMarkets(title: string) {
  const parts = [
    ...[...title.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]),
    ...title.replace(/\([^()]*\)/g, " ").split(/\s*[|–—]\s*|\s+-\s+|\s*,\s*/).slice(1),
  ].flatMap((p) => p.split(/\s*[/,&]\s*|\s+and\s+|\s+or\s+/)).map((p) => p.trim()).filter(Boolean);
  const abroad = new Set<RegionKey>();
  let otherIndia = false;
  let bengaluru = false;
  for (const p of parts) {
    for (const [key, re] of TITLE_ABROAD) if (re.test(p)) abroad.add(key);
    if (OTHER_INDIA.test(p)) otherIndia = true;
    if (/^(bengaluru|bangalore|karnataka|south india|india|pan india|remote)$/i.test(p)) bengaluru = true;
  }
  return { abroad: [...abroad], otherIndia, bengaluru };
}

/**
 * Whether a title names a market other than `city` ("SDR (Gujarat)" on the Bengaluru page): such roles leave that
 * city's public list (27 Nov review).
 */
export function titleElsewhere(title: string, city: string) {
  const t = titleMarkets(title);
  if (t.bengaluru && /bengaluru|bangalore/i.test(city)) return false;
  if (!t.otherIndia) return false;
  const named = title.toLowerCase();
  const aliases: Record<string, string[]> = { "delhi ncr": ["delhi", "ncr", "gurgaon", "gurugram", "noida"], bengaluru: ["bengaluru", "bangalore"] };
  return !(aliases[city.toLowerCase()] ?? [city.toLowerCase()]).some((w) => named.includes(w));
}

export function regionsOf(raw: { location: string; workSetting?: string | null; title?: string }): RegionKey[] {
  const found = placeRegions(raw);
  if (!raw.title) return found;
  // A title naming another market wins over the location field (27 Nov review: "Account Executive - US" and
  // "Territory AE (Gujarat)" showed under Bengaluru).
  // A market abroad ("- US", "EMEA") is who the team sells to, not where it sits: a team in India selling into the US
  // stays a Bengaluru-or-remote job (owner's rule, convex/listQuality.test.ts). It only adds that market's region.
  const t = titleMarkets(raw.title);
  if (t.bengaluru || !t.otherIndia) return [...new Set<RegionKey>([...found, ...t.abroad])];
  // Another Indian territory ("Territory AE (Gujarat)") is that territory's job, remote or not.
  const kept = found.filter((r) => r !== "blr" && r !== "other" && r !== "remote");
  return [...new Set<RegionKey>([...kept, "india", ...t.abroad])];
}

function placeRegions(raw: { location: string; workSetting?: string | null; title?: string }): RegionKey[] {
  // No place given but the title ends in a city ("Senior AE, Bengaluru"): use that, so the job lands in its city
  // instead of "Other" (27 Nov review: Today's top pick was missing from Jobs' default view).
  const fromTitle = !tidyPlace(raw.location) && raw.title ? cityInTitle(raw.title) : null;
  const job = fromTitle ? { ...raw, location: fromTitle } : raw;
  const found: RegionKey[] = [];
  if (inBengaluru(job.location) || remoteForIndia(job.location, job.workSetting, job.title)) found.push("blr");
  if (job.workSetting === "remote" || /\bremote\b/i.test(job.location)) found.push("remote");
  for (const key of Object.keys(PATTERNS) as (keyof typeof PLACES)[]) {
    if (PATTERNS[key].test(job.location)) found.push(key);
  }
  if (!found.some((r) => r !== "remote" && r !== "blr") && US_STATE.test(job.location)) found.push("us");
  if (!found.some((r) => r !== "blr")) found.push("other");
  return found;
}
