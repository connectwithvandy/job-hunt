// What JobPipe reads from your main CV, shown on Profile → About you so a misread can be fixed before it
// shapes every tailored CV and fit score. Plain text work only: no AI, read straight from the saved CV.

type Role = { company: string; role: string; start: string; end: string; bullets: string[]; blurb?: string };
type Cv = {
  headline: string;
  summary: string;
  experience: Role[];
  skills: { technical: string[]; soft: string[] };
};

export type CvReadback = {
  current: string | null;
  years: number | null;
  roles: { title: string; company: string; when: string }[];
  regions: string[];
  skills: string[];
  numbers: string[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Nov 2025", "2019", "11/2020" or "Present" as a month count since year 0; null when there's no year in it. */
export function monthOf(text: string, now = new Date()): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/present|current|now|today/.test(t)) return now.getFullYear() * 12 + now.getMonth();
  const year = t.match(/(19|20)\d{2}/)?.[0];
  if (!year) return null;
  const mon = MONTHS.findIndex((m) => t.includes(m));
  const num = t.match(/\b(\d{1,2})\s*[/.-]\s*(?:19|20)\d{2}/)?.[1];
  const month = mon >= 0 ? mon : num ? Math.min(11, Math.max(0, Number(num) - 1)) : 0;
  return Number(year) * 12 + month;
}

const REGIONS: [string, RegExp][] = [
  ["India", /\bindia\b/i],
  ["APAC", /\b(apac|apj|asia[- ]pacific)\b/i],
  ["Southeast Asia", /\b(sea|southeast asia|asean)\b/i],
  ["EMEA", /\b(emea|europe|uk)\b/i],
  ["Middle East", /\b(mena|middle east|gcc|uae)\b/i],
  ["North America", /\b(north america|namer|na\b|us market|usa|united states)\b/i],
  ["ANZ", /\b(anz|australia)\b/i],
  ["LATAM", /\b(latam|latin america)\b/i],
];

// A real figure: a percentage, money, a multiple or a team size. Bare years don't count.
const NUMBER = /(\d[\d,.]*\s?%|[$₹€£]\s?\d[\d,.]*\s?(?:k|m|mn|bn|b|cr|l|lakh|crore)?\b|\b\d[\d,.]*\s?(?:k|m|mn|cr|crore|lakh)\b|\b\d+(?:\.\d+)?x\b|\b\d+[- ](?:member|person|people|rep|sdr|bdr|ae)s?\b|\bteam of \d+\b)/i;

const clip = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The facts JobPipe takes from a CV, in the order a person would check them. */
export function readCv(cv: Cv | null | undefined, now = new Date()): CvReadback | null {
  if (!cv) return null;
  const exp = cv.experience.filter((e) => e.company.trim() || e.role.trim());
  const first = exp[0];
  const current = first ? [first.role, first.company].filter(Boolean).join(" at ") : null;

  const starts = exp.map((e) => monthOf(e.start, now)).filter((m): m is number => m !== null);
  const ends = exp.map((e) => monthOf(e.end, now) ?? monthOf(e.start, now)).filter((m): m is number => m !== null);
  const years = starts.length && ends.length ? Math.max(0, Math.floor((Math.max(...ends) - Math.min(...starts)) / 12)) : null;

  const roles = exp.slice(0, 3).map((e) => ({
    title: e.role,
    company: e.company,
    when: [e.start, e.end].filter((s) => s.trim()).join(" – "),
  }));

  const text = [cv.headline, cv.summary, ...exp.flatMap((e) => [e.blurb ?? "", ...e.bullets])].join("\n");
  const regions = REGIONS.filter(([, re]) => re.test(text)).map(([name]) => name);

  const skills = [...new Set(cv.skills.technical.map((s) => s.trim()).filter(Boolean))].slice(0, 10);

  const numbers: string[] = [];
  for (const e of exp.slice(0, 3)) {
    for (const b of e.bullets) {
      if (numbers.length >= 5) break;
      if (NUMBER.test(b)) numbers.push(clip(b.trim()));
    }
  }

  return { current, years, roles, regions, skills, numbers };
}
