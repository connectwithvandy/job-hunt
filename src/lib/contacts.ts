import Papa from "papaparse";
import type { Contact } from "./types";

/**
 * Parse LinkedIn's Connections.csv (Settings > Data privacy > Get a copy of your data > Connections).
 * The file starts with a few lines of notes before the real header row.
 */
export function parseConnectionsCsv(text: string): Contact[] {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.startsWith("First Name,"));
  if (headerAt === -1) {
    throw new Error("This doesn't look like LinkedIn's Connections.csv. Its header should start with \"First Name\".");
  }
  const { data } = Papa.parse<Record<string, string>>(lines.slice(headerAt).join("\n"), {
    header: true,
    skipEmptyLines: true,
  });
  return data
    .filter((r) => r["First Name"] || r["Last Name"])
    .map((r) => ({
      id: (r["URL"] || `${r["First Name"]}-${r["Last Name"]}-${r["Company"]}`).trim(),
      firstName: (r["First Name"] ?? "").trim(),
      lastName: (r["Last Name"] ?? "").trim(),
      url: (r["URL"] ?? "").trim(),
      email: (r["Email Address"] ?? "").trim(),
      company: (r["Company"] ?? "").trim(),
      position: (r["Position"] ?? "").trim(),
      connectedOn: (r["Connected On"] ?? "").trim(),
    }));
}

const NOISE = /\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|company|technologies|technology|tech|software|solutions|labs|group|india|global|the)\b/g;

export function normalizeCompany(name: string) {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
}

export function sameCompany(a: string, b: string) {
  const x = normalizeCompany(a);
  const y = normalizeCompany(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // "razorpay" vs "razorpay software": allow a prefix match on a whole word.
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  if (short.length >= 4 && long.startsWith(short + " ")) return true;
  // "thermofisher" vs "thermo fisher scientific": compare with spaces removed.
  const [s2, l2] = [short.replace(/ /g, ""), long.replace(/ /g, "")];
  return s2.length >= 6 && l2.startsWith(s2);
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

export function contactsAt(company: string, contacts: Contact[]) {
  return contacts
    .filter((c) => sameCompany(c.company, company))
    .sort((a, b) => referralRank(b.position) - referralRank(a.position));
}

export function linkedInPeopleSearch(company: string, title: string) {
  const keywords = `${title} ${company}`;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}
