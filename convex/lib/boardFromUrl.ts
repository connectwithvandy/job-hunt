import type { CareerBoard } from "./careerBoards";

/**
 * The careers board behind a job link, when it's one we can read: jobs.ashbyhq.com/<slug>,
 * boards.greenhouse.io/<slug>, jobs.lever.co/<slug>, <tenant>.wdN.myworkdayjobs.com/<site> or <slug>.keka.com/careers.
 * EU-hosted Greenhouse and Lever boards use other addresses, so they're left out.
 */
export function boardFromUrl(link: string | undefined): Omit<CareerBoard, "name" | "website"> | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  const clean = (s?: string) => (s && /^[A-Za-z0-9_-]{2,80}$/.test(s) ? s : null);
  if (host === "jobs.ashbyhq.com") {
    const slug = clean(parts[0]);
    return slug ? { ats: "ashby", slug } : null;
  }
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    const slug = clean(parts[0] === "embed" ? (url.searchParams.get("for") ?? undefined) : parts[0]);
    return slug ? { ats: "greenhouse", slug: slug.toLowerCase() } : null;
  }
  if (host === "jobs.lever.co") {
    const slug = clean(parts[0]);
    return slug ? { ats: "lever", slug } : null;
  }
  const keka = host.match(/^([a-z0-9-]+)\.keka\.com$/);
  if (keka && parts[0] === "careers" && !["app", "www", "help", "academy"].includes(keka[1])) return { ats: "keka", slug: keka[1] };
  const workday = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (workday) {
    // The site name, after an optional language like en-US.
    const site = clean(/^[a-z]{2}-[A-Z]{2}$/.test(parts[0] ?? "") ? parts[1] : parts[0]);
    return site && site !== "job" ? { ats: "workday", slug: `${workday[1]}.${workday[2]}/${workday[1]}/${site}` } : null;
  }
  return null;
}
