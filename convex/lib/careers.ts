"use node";

// Reads one company's careers board. All three systems publish open roles as free public JSON, no key.

import type { CareerBoard } from "./careerBoards";
import { htmlToText } from "./sources";

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

export async function readBoard(board: CareerBoard): Promise<CareerJob[]> {
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
