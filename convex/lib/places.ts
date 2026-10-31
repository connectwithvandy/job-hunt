// Which places a job is open to, read from its free-text location.

const BLR = /\b(bengaluru|bangalore)\b/i;
const INDIA_OK = /\b(india|worldwide|anywhere|global|apac|asia)\b/i;
// A remote job tied to another Indian city or state is a field job there: "KOLKATA : Remote", "Remote - Tamil Nadu".
const OTHER_INDIAN_PLACE =
  /\b(mumbai|delhi|new delhi|gurugram|gurgaon|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|kochi|chandigarh|indore|lucknow|coimbatore|nagpur|surat|vadodara|bhubaneswar|patna|rewari|mangalore|shimoga|shivamogga|maharashtra|delhi ncr|ncr|telangana|tamil nadu|haryana|west bengal|gujarat|rajasthan|kerala|uttar pradesh|punjab|odisha|bihar|andhra pradesh|madhya pradesh)\b/i;
// A title naming one country outside India, so likely hiring there: "Strategic Account Executive, France", "Territory AE, Saskatchewan".
const FOREIGN_MARKET =
  /\b(united states|usa|canada|saskatchewan|manitoba|ontario|quebec|alberta|british columbia|united kingdom|ireland|france|germany|spain|italy|netherlands|poland|sweden|uae|saudi|ksa|australia|new zealand|japan|korea|brazil|mexico)\b/i;

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
