// Who the weekly careers finder looks up, beyond the YC list and Dream companies (19 Nov 2026):
// companies where members have LinkedIn connections, companies behind the paid LinkedIn and Google jobs,
// and companies members are applying to. All free to look up; each company is checked about once a month.
import { companyKey } from "./company";

export type FinderSource = "yc" | "dream" | "connections" | "pool" | "applied";
export type SourcedCandidate = { name: string; website: string; slug?: string; from: FinderSource };

/** New companies looked up per weekly run from connections, pool jobs and applications together. */
export const EXTRA_PER_RUN = 300;

// Not companies, or too big and too generic to have one careers board we read.
// Matched on the name in plain lowercase words, so "Self-employed" and "Stealth Startup" both count.
const NOT_A_COMPANY = /^(self ?employed|freelanc\w*( \w+)?|stealth( \w+)?|independent( \w+)?|consultant|unemployed|retired|student|confidential|n ?a|none|various|own business|entrepreneur|career break)$/;

/** True when a LinkedIn "company" is worth looking up: a real name, not "Self-employed" or blank. */
export function isRealCompany(name: string): boolean {
  const n = name.trim();
  const words = n.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return n.length >= 2 && n.length <= 80 && !NOT_A_COMPANY.test(words) && companyKey(n).length >= 3;
}

/** Company names ranked by how often they appear, most first; the first spelling seen is kept. */
export function rankByCount(names: string[]): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const raw of names) {
    if (!isRealCompany(raw)) continue;
    const key = companyKey(raw);
    const c = counts.get(key);
    if (c) c.n++;
    else counts.set(key, { name: raw.trim(), n: 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.name);
}

/**
 * One list for the finder: the first sources win on a repeated company (so a YC entry keeps its website),
 * companies that already have a board are left out, and the extra sources together give at most `cap`.
 */
export function mergeCandidates(
  base: SourcedCandidate[],
  extra: SourcedCandidate[],
  haveBoard: Set<string>,
  cap = EXTRA_PER_RUN,
): SourcedCandidate[] {
  const out = new Map<string, SourcedCandidate>();
  for (const c of base) {
    const key = companyKey(c.name);
    if (key && !out.has(key)) out.set(key, c);
  }
  let added = 0;
  for (const c of extra) {
    if (added >= cap) break;
    const key = companyKey(c.name);
    if (!key || out.has(key) || haveBoard.has(key) || !isRealCompany(c.name)) continue;
    out.set(key, c);
    added++;
  }
  return [...out.values()];
}

/** "connections 3, pool 1" for the finder's log line; empty when nothing was found. */
export function countBySource(found: { from: FinderSource }[]): string {
  const counts = new Map<FinderSource, number>();
  for (const f of found) counts.set(f.from, (counts.get(f.from) ?? 0) + 1);
  return [...counts.entries()].map(([from, n]) => `${from} ${n}`).join(", ");
}
