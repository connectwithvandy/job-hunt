"use node";

// Reads one company's careers board. All three systems publish open roles as free public JSON, no key.

import type { CareerBoard } from "./careerBoards";
import { htmlToText, titleMatches } from "./sources";

export type CareerJob = {
  externalId: string;
  company: string;
  title: string;
  location: string;
  workSetting?: string;
  salary?: string;
  postedAt?: string;
  url: string;
  description?: string;
};

// Descriptions are kept short: scoring needs the gist, the full text is one click away.
// Drops half an emoji left at the cut, which the database refuses.
const cut = (text?: string | null) => (text ? text.slice(0, 4000).replace(/[\uD800-\uDBFF]$/, "") : undefined);
const unescape = (html: string) => html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

type AshbyJob = {
  id: string; title: string; location?: string; secondaryLocations?: { location: string }[]; isRemote?: boolean; isListed?: boolean;
  jobUrl: string; publishedAt?: string; descriptionPlain?: string;
  shouldDisplayCompensationOnJobPostings?: boolean; compensation?: { compensationTierSummary?: string };
};

type GreenhouseJob = { id: number; title: string; absolute_url: string; location?: { name?: string }; first_published?: string; updated_at?: string; content?: string };

type LeverJob = {
  id: string; text: string; hostedUrl: string; createdAt?: number; workplaceType?: string;
  categories?: { location?: string; allLocations?: string[] };
  descriptionPlain?: string; lists?: { text: string; content: string }[]; additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

type WorkdayHit = { title: string; externalPath: string };
type WorkdayJob = {
  title: string; jobDescription?: string; location?: string; additionalLocations?: string[]; remoteType?: string;
  startDate?: string; externalUrl: string; country?: { descriptor?: string };
};

/**
 * Workday has no full list: it searches. So it's searched for each title, and only title matches are
 * opened for their places and description. Roles already saved (`known`) come back as ids only.
 */
async function readWorkday(board: CareerBoard, titles: string[], known: Set<string>): Promise<(CareerJob | { externalId: string; known: true })[]> {
  const [host, tenant, site] = board.slug.split("/");
  const base = `https://${host}.myworkdayjobs.com/wday/cxs/${tenant}/${site}`;
  const hits = new Map<string, WorkdayHit>();
  const searchTitle = async (title: string) => {
    // Two pages of 20 (Workday's most): its matching is loose, so the close ones come first.
    for (let offset = 0; offset < 40; offset += 20) {
      const res = await fetch(`${base}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: title }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`${host} answered ${res.status}`);
      const page = (await res.json()) as { total?: number; jobPostings?: WorkdayHit[] };
      for (const h of page.jobPostings ?? []) if (titleMatches(title, h.title)) hits.set(h.externalPath, h);
      if ((page.jobPostings ?? []).length < 20) break;
    }
  };
  await Promise.all(titles.map(searchTitle));
  const open = async (h: WorkdayHit): Promise<CareerJob | { externalId: string; known: true }> => {
    const externalId = `workday:${board.slug}:${h.externalPath}`;
    if (known.has(externalId)) return { externalId, known: true };
    const j = (await getJson<{ jobPostingInfo: WorkdayJob }>(`${base}${h.externalPath}`)).jobPostingInfo;
    const places = [j.location, ...(j.additionalLocations ?? []), j.country?.descriptor].filter(Boolean).join("; ");
    const remote = /remote/i.test(`${j.remoteType ?? ""} ${places}`);
    return {
      externalId,
      company: board.name,
      title: j.title.trim(),
      location: places || "Not listed",
      workSetting: remote ? "remote" : undefined,
      postedAt: j.startDate,
      url: j.externalUrl,
      description: cut(j.jobDescription && htmlToText(j.jobDescription)),
    };
  };
  const list = [...hits.values()].slice(0, 80);
  const out: (CareerJob | { externalId: string; known: true })[] = [];
  for (let i = 0; i < list.length; i += 8) out.push(...(await Promise.all(list.slice(i, i + 8).map(open))));
  return out;
}

type KekaJob = {
  id: string | number; title: string; description?: string; publishedOn?: string;
  jobLocations?: { name?: string; city?: string; countryName?: string }[];
};

/** Keka's careers page names the company's board id; the open roles come from that board. */
async function readKeka(board: CareerBoard): Promise<CareerJob[]> {
  const base = `https://${board.slug}.keka.com/careers`;
  const page = await fetch(base, { signal: AbortSignal.timeout(30_000) });
  if (!page.ok) throw new Error(`${board.slug}.keka.com answered ${page.status}`);
  const boardId = (await page.text()).match(/ats\/documents\/([0-9a-f-]{36})\//)?.[1];
  if (!boardId) throw new Error(`${board.slug}.keka.com has no careers board`);
  const jobs = await getJson<KekaJob[]>(`${base}/api/embedjobs/default/active/${boardId}`);
  return jobs.map((j) => {
    const places = [...new Set((j.jobLocations ?? []).flatMap((l) => [l.city || l.name, l.countryName]).filter(Boolean))].join("; ");
    const remote = /remote/i.test(places);
    return {
      externalId: `keka:${board.slug}:${j.id}`,
      company: board.name,
      title: j.title.trim(),
      location: places || "Not listed",
      workSetting: remote ? "remote" : undefined,
      postedAt: j.publishedOn,
      url: `${base}/jobdetails/${j.id}`,
      description: cut(j.description && htmlToText(j.description)),
    };
  });
}

type ZohoJob = {
  id: string; Posting_Title?: string; Job_Opening_Name?: string; City?: string; State?: string; Country?: string;
  Remote_Job?: boolean; Job_Description?: string; Date_Opened?: string; Publish?: boolean;
};

/** Zoho Recruit puts the open roles in the careers page itself, as a hidden list. */
async function readZoho(board: CareerBoard): Promise<CareerJob[]> {
  const base = `https://${board.slug}/jobs/Careers`;
  const res = await fetch(base, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${board.slug} answered ${res.status}`);
  const page = await res.text();
  const raw = page.match(/<input[^>]*id="jobs"[^>]*value="([^"]*)"/)?.[1] ?? page.match(/value="([^"]*)"[^>]*id="jobs"/)?.[1];
  if (!raw) throw new Error(`${board.slug} has no careers list`);
  const jobs = JSON.parse(unescape(raw).replace(/&#34;/g, '"')) as ZohoJob[];
  return jobs.filter((j) => j.Publish !== false).map((j) => {
    const title = (j.Posting_Title || j.Job_Opening_Name || "").trim();
    const places = [...new Set([j.City, j.State, j.Country].filter(Boolean))].join(", ");
    return {
      externalId: `zoho:${board.slug}:${j.id}`,
      company: board.name,
      title,
      location: j.Remote_Job ? `${places || "Anywhere"} (Remote)` : places || "Not listed",
      workSetting: j.Remote_Job ? "remote" : undefined,
      postedAt: j.Date_Opened,
      url: `${base}/${j.id}/${title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      description: cut(j.Job_Description && htmlToText(j.Job_Description)),
    };
  }).filter((j) => j.title);
}

/** Freshteam has no feed, but its careers page lists each role with its place in plain HTML. */
async function readFreshteam(board: CareerBoard): Promise<CareerJob[]> {
  const base = `https://${board.slug}.freshteam.com`;
  const res = await fetch(`${base}/jobs`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${board.slug}.freshteam.com answered ${res.status}`);
  const page = await res.text();
  if (page.includes("couldn't find")) throw new Error(`${board.slug}.freshteam.com has no careers page`);
  const out: CareerJob[] = [];
  const re = /<a href="(\/jobs\/([A-Za-z0-9_-]+)\/[^"]*)"[^>]*data-portal-location="([^"]*)"[^>]*data-portal-remote-location=(true|false)[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of page.matchAll(re)) {
    const title = htmlToText(m[5].match(/class="job-title">([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!title) continue;
    const remote = m[4] === "true";
    out.push({
      externalId: `freshteam:${board.slug}:${m[2]}`,
      company: board.name,
      title,
      location: remote ? `${m[3] || "Anywhere"} (Remote)` : m[3] || "Not listed",
      workSetting: remote ? "remote" : undefined,
      url: `${base}${m[1]}`,
      // Only the opening lines are on the list page; the full text is a click away.
      description: cut(htmlToText(m[5].match(/class="job-desc[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "")),
    });
  }
  return out;
}

export async function readBoard(board: CareerBoard, titles: string[] = [], known = new Set<string>()): Promise<(CareerJob | { externalId: string; known: true })[]> {
  if (board.ats === "workday") return await readWorkday(board, titles, known);
  if (board.ats === "keka") return await readKeka(board);
  if (board.ats === "zoho") return await readZoho(board);
  if (board.ats === "freshteam") return await readFreshteam(board);
  const id = (jobId: string | number) => `${board.ats}:${board.slug}:${jobId}`;
  if (board.ats === "ashby") {
    const body = await getJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`);
    return body.jobs.filter((j) => j.isListed !== false).map((j) => {
      const places = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean).join("; ");
      return {
        externalId: id(j.id),
        company: board.name,
        title: j.title.trim(),
        location: j.isRemote ? `${places || "Anywhere"} (Remote)` : places || "Not listed",
        workSetting: j.isRemote ? "remote" : undefined,
        salary: j.shouldDisplayCompensationOnJobPostings ? j.compensation?.compensationTierSummary || undefined : undefined,
        postedAt: j.publishedAt,
        url: j.jobUrl,
        description: cut(j.descriptionPlain),
      };
    });
  }
  if (board.ats === "greenhouse") {
    const body = await getJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`);
    return body.jobs.map((j) => {
      const location = j.location?.name?.trim() || "Not listed";
      return {
        externalId: id(j.id),
        company: board.name,
        title: j.title.trim(),
        location,
        workSetting: /remote/i.test(location) ? "remote" : undefined,
        postedAt: j.first_published ?? j.updated_at,
        url: j.absolute_url,
        // Greenhouse sends the description as escaped HTML.
        description: cut(j.content && htmlToText(unescape(j.content))),
      };
    });
  }
  const jobs = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${board.slug}?mode=json`);
  return jobs.map((j) => {
    const places = [...new Set([j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean))].join("; ");
    const remote = j.workplaceType === "remote";
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    const s = j.salaryRange;
    return {
      externalId: id(j.id),
      company: board.name,
      title: j.text.trim(),
      location: remote ? `${places || "Anywhere"} (Remote)` : places || "Not listed",
      workSetting: remote ? "remote" : undefined,
      salary: s?.min && s?.max ? `${s.currency ?? ""} ${s.min.toLocaleString()} – ${s.max.toLocaleString()}${s.interval ? ` ${s.interval}` : ""}`.trim() : undefined,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
      url: j.hostedUrl,
      description: cut([j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n")),
    };
  });
}
