// Sorts a job's free-text location into broad regions for the Jobs page filter.
// A job can sit in more than one, like a remote role open to India.

export const REGIONS = [
  { key: "india", label: "India" },
  { key: "remote", label: "Remote" },
  { key: "us", label: "US & Canada" },
  { key: "europe", label: "UK & Europe" },
  { key: "mideast", label: "Middle East" },
  { key: "apac", label: "Asia Pacific" },
  { key: "other", label: "Other" },
] as const;

export type RegionKey = (typeof REGIONS)[number]["key"];

const PLACES: Record<Exclude<RegionKey, "remote" | "other">, string[]> = {
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

export function regionsOf(job: { location: string; workSetting?: string | null }): RegionKey[] {
  const found: RegionKey[] = [];
  if (job.workSetting === "remote" || /\bremote\b/i.test(job.location)) found.push("remote");
  for (const key of Object.keys(PATTERNS) as (keyof typeof PLACES)[]) {
    if (PATTERNS[key].test(job.location)) found.push(key);
  }
  if (!found.some((r) => r !== "remote") && US_STATE.test(job.location)) found.push("us");
  if (!found.length) found.push("other");
  return found;
}
