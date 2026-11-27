// Job titles and places as boards send them are messy: "TERRITORY ACCOUNT EXECUTIVE - IT/ITES", "Bangalore, , India".
// These tidy them for display only; the stored job keeps the original (design round 1, 27 Nov 2026).

/** Short words and acronyms kept as written when a shouty title is turned into title case. */
const KEEP = new Set(["SDR", "BDR", "AE", "AM", "SMB", "MM", "ENT", "APAC", "EMEA", "ANZ", "NA", "US", "UK", "IT", "ITES", "SAAS", "B2B", "B2C", "TMT", "CRM", "GTM", "HR", "VP", "II", "III", "IV"]);
const SMALL = new Set(["and", "of", "the", "for", "to", "in", "at", "on", "a", "an", "or"]);
const SPELL: Record<string, string> = { SAAS: "SaaS" };

/** Title case when at least 60% of the letters are capitals; anything else is left alone. */
export function tidyTitle(title: string) {
  const letters = title.replace(/[^A-Za-z]/g, "");
  if (!letters) return title.trim();
  const caps = letters.replace(/[^A-Z]/g, "").length;
  if (caps / letters.length < 0.6) return title.trim();
  let first = true;
  return title
    .trim()
    .split(/(\s+|[-/(),–])/)
    .map((w) => {
      if (!/[A-Za-z]/.test(w)) return w;
      const up = w.toUpperCase();
      const out = KEEP.has(up) ? (SPELL[up] ?? up) : !first && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase();
      first = false;
      return out;
    })
    .join("");
}

const INDIAN_CITIES = ["Bengaluru", "Mumbai", "Delhi", "New Delhi", "Gurugram", "Gurgaon", "Noida", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Kochi", "Chandigarh", "Indore", "Coimbatore", "Thiruvananthapuram", "Navi Mumbai", "Bangalore"];
const STATES = ["Karnataka", "Maharashtra", "Telangana", "Tamil Nadu", "Haryana", "Uttar Pradesh", "West Bengal", "Gujarat", "Kerala", "Rajasthan", "Delhi NCR", "KA", "MH", "TN", "TS"];
/** Bits that aren't a place: country codes, work modes (shown in their own slot), board junk. */
const NOT_A_PLACE = /^(in|ind|india\s*\(ind\)|hybrid|remote|on-?site|onsite|wfo|wfh|south|north|east|west|fmb)$/i;
const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const isCity = (p: string) => INDIAN_CITIES.some((c) => c.toLowerCase() === p.toLowerCase());

/** "Bangalore, Karnataka, India" → "Bengaluru". At most two parts, no repeats, no state when the city is there. */
const ACRONYM = /^(apac|emea|anz|mena|latam|amer|namer|uae|usa|uk|us|ncr|gcc|sea)$/i;

export function tidyPlace(place?: string) {
  if (!place || /^not listed$/i.test(place.trim())) return "";
  const parts = plain(place)
    .replace(/\(([^)]+)\)/g, ",$1,")
    .split(/,| - |\||;|\s\/\s|\//)
    .map((p) => p.trim())
    // Pin codes, country codes and work modes out: "BENGALURU, 560001, IN" → "Bengaluru".
    .filter((p) => p && !/^\d{3,}$/.test(p) && !NOT_A_PLACE.test(p))
    .map((p) => (p.length > 3 && p === p.toUpperCase() && !ACRONYM.test(p) ? p.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : p))
    // One way to write a place (27 Nov review): "Bangalore North", "Bengaluru Urban" → "Bengaluru"; "Apac" → "APAC".
    .map((p) =>
      p
        .replace(/^(bangalore|bengaluru)(\s+(north|south|east|west|urban|rural|city))?$/i, "Bengaluru")
        .replace(/^Gurgaon$/i, "Gurugram")
        .replace(/^(global|worldwide|anywhere)$/i, "Remote · worldwide")
        .replace(ACRONYM, (m) => m.toUpperCase()),
    )
    .filter((p, i, all) => all.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  const hasIndianCity = parts.some(isCity);
  const kept = parts.filter((p) => !(hasIndianCity && /^india$/i.test(p)) && !(parts.length > 1 && STATES.some((s) => s.toLowerCase() === p.toLowerCase())));
  // With a known city, a mall or street name beside it is noise ("Vega City Mall-Ls-Blr, Bengaluru" → "Bengaluru").
  if (hasIndianCity) {
    const city = kept.find(isCity)!;
    // The city alone: neighbourhoods and store names ("Biba Indira Nagar", "Nagarbhavi") made one city read many
    // ways (27 Nov review).
    return city;
  }
  return kept.slice(0, 2).join(", ");
}

/** A city at the end of a title ("Senior AE, Bengaluru"), for jobs whose place field came empty. */
export function cityInTitle(title: string) {
  const m = title.match(/(?:,|\s[-–]\s)\s*([A-Za-z ]+?)\s*$/) ?? title.match(/\bbased in ([A-Za-z]+(?: [A-Za-z]+)?)\b/i);
  return m && isCity(m[1].trim()) ? m[1].trim().replace(/^bangalore$/i, "Bengaluru") : null;
}

/** The title to show: tidied, without a trailing city (shown in the place slot) or a board's code ("Fmb 02", "1344"). */
export function showTitle(title: string) {
  let t = tidyTitle(title);
  if (cityInTitle(t)) t = t.replace(/(?:,|\s[-–]\s)\s*[A-Za-z ]+?\s*$/, "");
  return t.replace(/(\s+[A-Za-z]{0,4}\s*\d{2,5})+$/, "").trim() || tidyTitle(title);
}

/** The place to show: the place field, else a city from the title. */
export function showPlace(job: { location?: string; title: string }) {
  return tidyPlace(job.location) || cityInTitle(job.title) || "";
}

/** Job boards that sometimes land in the company slot; the board's name never shows. */
const BOARDS = /^(indeed(\.com|\.co\.in)?|naukri(\.com)?|foundit|monster|glassdoor|shine(\.com)?|timesjobs|linkedin jobs)$/i;
export const showCompany = (company: string) =>
  BOARDS.test(company.trim())
    ? "Company not listed"
    : company
        .trim()
        // Words a board cut short or prefixed: "Cravingcode Technologie" → "Technologies", "Us Scimplify" → "Scimplify".
        .replace(/\bTechnologie$/, "Technologies")
        .replace(/\bSolution$/, "Solutions")
        .replace(/^Us\s+(?=[A-Z])/, "");

/**
 * The employer a recruiter's posting is really for, when its text opens by naming another company ("Buildesk is a
 * fast-growing PropTech platform…" under Cravingcode): shown as "Hiring for Buildesk" so the header and the text
 * never disagree (27 Nov review). Null when the text doesn't clearly name a different company.
 */
export function hiringFor(description: string | undefined, company: string) {
  if (!description) return null;
  const start = description.trim().slice(0, 300);
  const m = start.match(/^(?:About\s+)?([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+){0,2})\s+(?:is|are|was)\s+(?:a|an|the|one|india's|a leading)\b/) ?? start.match(/^About\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+){0,2})\s*[:\n]/);
  if (!m) return null;
  const name = m[1].trim();
  if (/^(we|our|the|this|it|company|role|job|position|team|client|about|you|they|he|she)$/i.test(name)) return null;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const [a, b] = [key(name), key(company)];
  if (!a || !b || a.includes(b) || b.includes(a) || a.slice(0, 5) === b.slice(0, 5)) return null;
  return name;
}
