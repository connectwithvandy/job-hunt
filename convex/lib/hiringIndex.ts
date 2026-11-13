// What the India Sales Hiring Index shows, worked out from the open roles. Kept apart from the build so it can be tested.

export type IndexRole = { externalId: string; company: string; title: string; location: string; workSetting?: string; salary?: string; url: string; at: number };

export type HiringIndex = {
  totals: { open: number; newWeek: number; companies: number; withSalary: number };
  families: { name: string; open: number; newWeek: number }[];
  cities: { city: string; open: number; newWeek: number }[];
  /** Different roles open, not postings. */
  topCompanies: { company: string; open: number }[];
  bengaluru: { family: string; companies: { company: string; open: number }[] }[];
  reposted: { company: string; title: string; reposts: number }[];
  newest: { title: string; company: string; location: string; url: string }[];
  salaries: { title: string; company: string; location: string; salary: string }[];
};

const WEEK = 7 * 86_400_000;

/** A title without the place or team tacked on: "Field Sales Executive - Patna" and "... (Pune)" are one role. */
export function baseTitle(title: string) {
  return title.split(/\s+[-–—|]\s+|\s*[,(/]\s*/)[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** "PHONEPE LIMITED" as "PhonePe"-ish "Phonepe", "Acme Pvt. Ltd." as "Acme", "&amp;" as "&". */
export function cleanCompany(name: string) {
  let n = name.replace(/&amp;/gi, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
  n = n.replace(/[\s,]+(private limited|pvt\.? ?ltd\.?|limited|ltd\.?|inc\.?|llp|llc)$/i, "").trim();
  if (n.length > 4 && n === n.toUpperCase() && /[A-Z]{4}/.test(n)) n = n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  // Some boards repeat the name ("Gamlaa Gamlaa").
  return n.replace(/^(.+?)\s+\1$/i, "$1");
}

/**
 * One name per company: "Paytm Payments Services" goes under "Paytm" when both appear, because its first word is
 * another company's whole name. Single words never merge ("Metabase" stays apart from "Meta").
 */
export function mergeCompanies(names: string[]) {
  const single = new Map(names.filter((n) => !/\s/.test(n)).map((n) => [n.toLowerCase(), n]));
  return (name: string) => (/\s/.test(name) ? (single.get(name.split(/\s+/)[0].toLowerCase()) ?? name) : name);
}

/**
 * Companies by how many different roles they have open, biggest first, at most `n`. Different titles, not postings:
 * one role posted in twenty cities counts once, so a company copying the same ad everywhere can't top the list.
 */
function top(roles: { company: string; title: string }[], n: number) {
  const by = new Map<string, Set<string>>();
  for (const r of roles) by.set(r.company, (by.get(r.company) ?? new Set()).add(baseTitle(r.title)));
  return [...by].map(([c, t]) => [c, t.size] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/**
 * The Index from India sales roles already sorted into a role family and the cities they're open to.
 * `reposts` holds the times each role (by roleKey) came back after being taken down.
 */
export function buildIndex(
  roles: (IndexRole & { family: string; cities: string[]; key: string })[],
  reposts: Map<string, number>,
  families: string[],
  cities: string[],
  now: number,
): HiringIndex {
  const fresh = (r: IndexRole) => now - r.at < WEEK;
  return {
    totals: {
      open: roles.length,
      newWeek: roles.filter(fresh).length,
      companies: new Set(roles.map((r) => r.company.toLowerCase())).size,
      withSalary: roles.filter((r) => r.salary).length,
    },
    families: families.map((name) => {
      const mine = roles.filter((r) => r.family === name);
      return { name, open: mine.length, newWeek: mine.filter(fresh).length };
    }).filter((f) => f.open),
    cities: cities.map((city) => {
      const mine = roles.filter((r) => r.cities.includes(city));
      return { city, open: mine.length, newWeek: mine.filter(fresh).length };
    }),
    topCompanies: top(roles, 15).map(([company, open]) => ({ company, open })),
    bengaluru: ["SDR / BDR", "Account Executive"].map((family) => ({
      family,
      companies: top(roles.filter((r) => r.family === family && r.cities.includes("Bengaluru")), 10).map(([company, open]) => ({ company, open })),
    })),
    reposted: roles
      .map((r) => ({ company: r.company, title: r.title, reposts: reposts.get(r.key) ?? 0 }))
      .filter((r) => r.reposts > 0)
      .sort((a, b) => b.reposts - a.reposts)
      .filter((r, i, all) => all.findIndex((x) => x.company === r.company && x.title === r.title) === i)
      .slice(0, 10),
    newest: [...roles].sort((a, b) => b.at - a.at).slice(0, 10).map((r) => ({ title: r.title, company: r.company, location: r.location, url: r.url })),
    salaries: roles.filter((r) => r.salary).sort((a, b) => b.at - a.at).slice(0, 10).map((r) => ({ title: r.title, company: r.company, location: r.location, salary: r.salary! })),
  };
}
