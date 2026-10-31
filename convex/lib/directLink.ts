"use node";

// Every saved job should open the company's own posting, not a job board's copy of it.
// Board links (Himalayas, LinkedIn, Indeed and the like) are swapped for the company's link,
// found on the company's own careers board; a job with no company link is left out.
import { findBoard } from "./boardFinder";
import { readBoard, type CareerJob } from "./careers";

/** Sites that list other companies' jobs. Anything else is taken to be the company's own page or careers system. */
const BOARDS =
  /(^|\.)(himalayas\.app|linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|naukri\.com|foundit\.[a-z.]+|monster\.[a-z.]+|ziprecruiter\.com|adzuna\.[a-z.]+|simplyhired\.[a-z.]+|jooble\.org|talent\.com|wellfound\.com|angel\.co|instahyre\.com|iimjobs\.com|hirist\.[a-z.]+|cutshort\.io|shine\.com|timesjobs\.com|apna\.co|dreamworkhq\.com|ycombinator\.com|workatastartup\.com|hiring\.cafe|builtin\.com|remoteok\.com|weworkremotely\.com|remotive\.com|jobgether\.com|bebee\.com|learn4good\.com|careerjet\.[a-z.]+|www\.google\.com)$/i;

export function isCompanyLink(url?: string | null) {
  if (!url) return false;
  try {
    return !BOARDS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The company's posting with this title: the same title first, then one that contains the other. */
function sameRole(title: string, roles: { title: string; url: string }[]) {
  const want = norm(title);
  return roles.find((r) => norm(r.title) === want) ?? roles.find((r) => norm(r.title).includes(want) || want.includes(norm(r.title)));
}

const within = <T>(ms: number, p: Promise<T>) => Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);

type Linkable = { company: string; title: string; url: string; sourceUrl?: string };

/**
 * Gives every job its company link (in `sourceUrl`). `saved` returns the roles we already keep for a company
 * from its careers board. Jobs whose company link can't be found are dropped. At most `maxCompanies` companies
 * are looked up per call, so a search stays quick.
 */
export async function withCompanyLinks<T extends Linkable>(
  jobs: T[],
  saved: (company: string) => Promise<{ title: string; url: string }[]>,
  maxCompanies = 25,
): Promise<T[]> {
  const direct = (j: T) => (isCompanyLink(j.sourceUrl) ? j.sourceUrl : isCompanyLink(j.url) ? j.url : undefined);
  const ready = jobs.filter((j) => direct(j)).map((j) => ({ ...j, sourceUrl: direct(j) }));
  const todo = jobs.filter((j) => !direct(j));
  const companies = [...new Set(todo.map((j) => j.company))].slice(0, maxCompanies);

  // Each company's open roles, from what we keep or from its own board. Six at a time.
  const roles = new Map<string, { title: string; url: string }[]>();
  const queue = [...companies];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
        const company = c;
        const known = await saved(company).catch(() => []);
        if (known.length) {
          roles.set(company, known);
          continue;
        }
        const found = await within(
          25_000,
          (async () => {
            const board = await findBoard({ name: company, website: "" });
            if (!board) return [];
            const listed = await readBoard({ ...board, name: company, website: "" });
            return listed.filter((r): r is CareerJob => !("known" in r)).map((r) => ({ title: r.title, url: r.url }));
          })().catch(() => []),
        );
        roles.set(company, found ?? []);
      }
    }),
  );

  const linked = todo.flatMap((j) => {
    const match = sameRole(j.title, roles.get(j.company) ?? []);
    return match && isCompanyLink(match.url) ? [{ ...j, sourceUrl: match.url }] : [];
  });
  return [...ready, ...linked];
}
