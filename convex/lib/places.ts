// Which places a job is open to, read from its free-text location.

const BLR = /\b(bengaluru|bangalore)\b/i;
const INDIA_OK = /\b(india|worldwide|anywhere|global|apac|asia)\b/i;
// A remote job tied to another Indian city or state is a field job there: "KOLKATA : Remote", "Remote - Tamil Nadu".
const OTHER_INDIAN_PLACE =
  /\b(mumbai|delhi|new delhi|gurugram|gurgaon|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|kochi|chandigarh|indore|lucknow|coimbatore|nagpur|surat|vadodara|bhubaneswar|patna|rewari|mangalore|shimoga|shivamogga|maharashtra|delhi ncr|ncr|telangana|tamil nadu|haryana|west bengal|gujarat|rajasthan|kerala|uttar pradesh|punjab|odisha|bihar|andhra pradesh|madhya pradesh)\b/i;
// A title naming one country outside India, so likely hiring there: "Strategic Account Executive, France", "Territory AE, Saskatchewan".
// Federal and SLED (state, local, education) are US government sales teams, based in the US.
const FOREIGN_MARKET =
  /\b(federal|sled|united states|usa|canada|saskatchewan|manitoba|ontario|quebec|alberta|british columbia|united kingdom|ireland|france|germany|spain|italy|netherlands|poland|sweden|uae|saudi|ksa|australia|new zealand|japan|korea|brazil|mexico)\b/i;

/**
 * Remote, and not locked to other countries or other Indian cities: "Remote (United States)" is out,
 * "Remote (Worldwide)" or plain "Remote" is in. With the title, a plain "Remote" job whose title names
 * another country, like France or Canada, is out too. Markets like EMEA or US stay in: many
 * India-based remote teams sell into them.
 */
export function remoteForIndia(location: string, workSetting?: string | null, title = "") {
  const remote = workSetting === "remote" || /remote/i.test(location);
  if (!remote) return false;
  // "Remote (United States)" or "India (Remote)": the place is whatever isn't the word remote.
  const restriction = location.replace(/remote/gi, "").replace(/[-,·|()>:]/g, " ").trim();
  if (restriction && !BLR.test(restriction) && OTHER_INDIAN_PLACE.test(restriction)) return false;
  if (!/\b(india|apac|asia|saarc|bengaluru|bangalore)\b/i.test(title) && FOREIGN_MARKET.test(title)) return false;
  return !restriction || INDIA_OK.test(restriction);
}

export function inBengaluru(location: string) {
  return BLR.test(location);
}

// Other names a listing uses for the same city, so "Gurgaon" counts for someone who picked Gurugram.
const SAME_CITY: Record<string, string[]> = {
  bengaluru: ["bangalore"], bangalore: ["bengaluru"],
  gurugram: ["gurgaon"], gurgaon: ["gurugram"],
  delhi: ["new delhi", "ncr"], "new delhi": ["delhi", "ncr"],
  "delhi ncr": ["delhi", "new delhi", "ncr", "gurugram", "gurgaon", "noida"], ncr: ["delhi", "gurugram", "gurgaon", "noida"],
  mumbai: ["bombay", "navi mumbai"], kochi: ["cochin"], vadodara: ["baroda"], mysuru: ["mysore"], mangaluru: ["mangalore"],
};

/**
 * 0 to 1: how well a job's place suits where the person wants to work. `home` is their saved choice:
 * "Anywhere", "Remote" (remote roles open to someone in India), "India", or cities like "Bengaluru, Pune".
 * 0 means the job isn't open to them at all.
 */
export function placeFit(job: { location: string; workSetting?: string | null; title: string }, home: string) {
  const h = home.trim().toLowerCase();
  const remoteOk = remoteForIndia(job.location, job.workSetting, job.title);
  // "Anywhere" takes an office abroad (they'd move), but not a remote job locked to another country:
  // "Remote (United States)" can't be done from India.
  if (!h || h === "anywhere") return remoteOk || !(job.workSetting === "remote" || /remote/i.test(job.location)) ? 1 : 0;
  if (h === "remote") return remoteOk ? 1 : 0;
  const where = `${job.location} ${job.title}`.toLowerCase();
  const cities = h.split(",").map((c) => c.trim()).filter((c) => c && c !== "india" && c !== "remote");
  const names = [...cities, ...cities.flatMap((c) => SAME_CITY[c] ?? [])];
  if (names.some((n) => new RegExp(`\\b${n}\\b`).test(where))) return 1;
  if (remoteOk) return 0.9;
  // Someone open to all of India takes any Indian city; someone set on one city takes an "India" role at half.
  if (/\bindia\b/.test(where) || OTHER_INDIAN_PLACE.test(where) || BLR.test(where)) {
    if (!cities.length) return 1;
    return OTHER_INDIAN_PLACE.test(where) || BLR.test(where) ? 0.2 : 0.5;
  }
  return 0;
}
