import { createHash } from "node:crypto";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { backOffice, titleMatches } from "../../convex/lib/salesRoles";
import { regionsOf } from "./regions";
import { ROLE_PAGES, type RolePage } from "./rolePages";

/** Guide pages, job pages and the sitemap rebuild at most once a day. */
export const GUIDE_REVALIDATE = 86400;

const DAY = 86_400_000;
const AGGREGATORS = /\b(jobgether|bebee|talent\.com|jooble|careerjet)\b/i;

/**
 * A public Convex query, cached for a day. Convex's own fetch helper opts out of caching,
 * which would make every visit read the database.
 */
export async function cachedQuery<T>(path: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_CONVEX_URL}/api/query`, {
    method: "POST",
    // Part of the cache key: bump it when a query's result changes shape, so day-old saved copies aren't reused.
    headers: { "Content-Type": "application/json", "X-Cache-Shape": "2" },
    body: JSON.stringify({ path, args, format: "json" }),
    next: { revalidate: GUIDE_REVALIDATE },
  });
  const body = (await res.json()) as { status: string; value: T };
  if (body.status !== "success") throw new Error(`Convex said ${body.status}`);
  return body.value;
}

export type GuideRole = FunctionReturnType<typeof api.careers.forGuide>[number];

/** A guide's open roles from company careers boards: right title, right place, posted in the last 30 days, newest first. */
export async function openRoles(page: RolePage): Promise<GuideRole[]> {
  try {
    const rows = await cachedQuery<GuideRole[]>("careers:forGuide", { titles: page.jobs.titles, india: page.jobs.india });
    const now = Date.now();
    const seen = new Set<string>();
    return rows
      .filter((j) => page.jobs.titles.some((t) => titleMatches(t, j.title)) && !backOffice(j.title) && !page.jobs.exclude?.test(j.title))
      // Job aggregators that run their own careers board aren't the employer; jobs link to the company itself.
      .filter((j) => !AGGREGATORS.test(j.company))
      .filter((j) => regionsOf(j).some((r) => page.jobs.regions.includes(r)))
      .filter((j) => !j.postedAt || now - Date.parse(j.postedAt) < 30 * DAY)
      // The same role posted in several cities shows once.
      .filter((j) => !seen.has(`${j.company}|${j.title}`) && !!seen.add(`${j.company}|${j.title}`))
      .sort((a, b) => (Date.parse(b.postedAt ?? "") || 0) - (Date.parse(a.postedAt ?? "") || 0))
      .slice(0, 25);
  } catch (err) {
    // A failed read leaves the guide as it is; the list comes back on the next rebuild.
    console.warn("Guide roles failed", err);
    return [];
  }
}

/** Every role listed on any guide, once each. These are the roles that get their own page. */
export async function allGuideRoles(): Promise<GuideRole[]> {
  const lists = await Promise.all(ROLE_PAGES.map(openRoles));
  const byId = new Map<string, GuideRole>();
  for (const j of lists.flat()) if (j.externalId) byId.set(j.externalId, j);
  return [...byId.values()];
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");

/** Short, stable code for a role. Careers-board ids hold slashes (Workday), so they can't sit in a link. */
export const roleCode = (externalId: string) => createHash("sha1").update(externalId).digest("hex").slice(0, 10);

/** "/sales-jobs/role/sales-development-representative-at-rippling-3f9a1c2b7e" */
export const roleHref = (j: Pick<GuideRole, "externalId" | "title" | "company">) =>
  `/sales-jobs/role/${slugify(`${j.title} at ${j.company}`) || "role"}-${roleCode(j.externalId)}`;

/** Careers-board text can still carry tags and codes like "&#43;"; show it as plain text. */
export const cleanDescription = (s: string) =>
  s
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, "–")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
