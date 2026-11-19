// Your job preferences from Profile: a pay floor, the seniority you want, and words you never want in a job title.
// Used by the job list, so Jobs and Today both leave out what you said no to.

export type Seniority = "director" | "manager" | "senior" | "mid" | "junior";
export const SENIORITIES: Seniority[] = ["director", "manager", "senior", "mid", "junior"];

export type JobPrefs = {
  /** Lowest yearly pay you'd take, in lakhs of rupees. */
  minPayL?: number;
  /** Seniority levels you want. Empty or missing means any. */
  levels?: Seniority[];
  /** Words that hide a job when its title has one, like "Trainer". */
  blockedWords?: string[];
};

/** Seniority read from the title, since most boards don't send it. */
export function seniorityOf(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\b(vp|vice president|chief|head of|director|cro|cxo)\b/.test(t)) return "director";
  if (/\b(manager|lead|leader|principal|staff)\b/.test(t)) return "manager";
  if (/\b(senior|sr\.?|enterprise|strategic)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|associate|intern|trainee|entry)\b/.test(t)) return "junior";
  return "mid";
}

// Rough rupees per unit. Good enough for a pay floor; the screens use live rates.
const RATES: Record<string, number> = { USD: 88, GBP: 117, EUR: 102, INR: 1, SGD: 68, AED: 24, CAD: 63, AUD: 58, CHF: 110 };
const SYMBOLS: [string, string][] = [["US$", "USD"], ["CA$", "CAD"], ["S$", "SGD"], ["A$", "AUD"], ["C$", "CAD"], ["$", "USD"], ["£", "GBP"], ["€", "EUR"], ["₹", "INR"]];

/**
 * The top of the pay the posting itself lists, in lakhs a year. Null when the posting lists no pay we can read,
 * or when the figure is a guess ("est."): only pay the company wrote counts.
 */
export function listedTopPayL(salary: string | null | undefined): number | null {
  if (!salary || /\best\b|estimat/i.test(salary)) return null;
  const s = salary.toLowerCase();
  const lakhs = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d+(?:\.\d+)?)?\s*(lpa|lakhs?|l\b)/);
  if (lakhs) return Number(lakhs[2] ?? lakhs[1]);
  const code = Object.keys(RATES).find((c) => salary.toUpperCase().includes(c)) ?? SYMBOLS.find(([sym]) => salary.includes(sym))?.[1];
  if (!code) return null;
  const perYear = /hour|hr\b/.test(s) ? 2080 : /month|mo\b/.test(s) ? 12 : /week/.test(s) ? 52 : 1;
  const nums = [...salary.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*([kK])?/g)].map((m) => Number(m[1]) * (m[2] ? 1000 : 1)).filter((n) => n >= (perYear === 2080 ? 5 : 100));
  if (!nums.length) return null;
  const top = (Math.max(...nums) * perYear * RATES[code]) / 100_000;
  // A "year" figure too small to be a year's pay is a misread, so it can't rule a job out.
  return top < 1 ? null : top;
}

/** Whether your preferences hide this job. Jobs with no listed pay are never hidden for pay. */
export function hiddenByPrefs(job: { title: string; salary?: string | null }, prefs: JobPrefs | null | undefined) {
  if (!prefs) return false;
  const title = job.title.toLowerCase();
  if (prefs.blockedWords?.some((w) => w.trim() && new RegExp(`\\b${w.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title))) return true;
  if (prefs.levels?.length && !prefs.levels.includes(seniorityOf(job.title))) return true;
  if (prefs.minPayL) {
    const top = listedTopPayL(job.salary);
    if (top !== null && top < prefs.minPayL) return true;
  }
  return false;
}
