import type { MetadataRoute } from "next";
import { allGuideRoles, roleHref } from "@/lib/guideRoles";
import { GUIDES_UPDATED, ROLE_PAGES } from "@/lib/rolePages";

// Roles close during the day, so the sitemap is rebuilt every hour: every 6 hours still left 24 of 225 links dead (13 Nov).
export const revalidate = 3600;

async function stillUp(externalIds: string[]): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "careers:stillListed", args: { externalIds }, format: "json" }),
      next: { revalidate: 3600 },
    });
    const body = (await res.json()) as { status: string; value: string[] };
    return body.status === "success" ? new Set(body.value) : null;
  } catch {
    // If the check fails, list every role as before.
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = ["/sales-jobs", ...ROLE_PAGES.map((r) => `/sales-jobs/${r.slug}`)];
  // Rebuilt every Monday.
  const index = { url: "https://jobpipe.in/sales-jobs/india-sales-hiring-index", changeFrequency: "weekly" as const, priority: 0.7 };
  const pages: MetadataRoute.Sitemap = ["", "/cv-review", ...guides, "/compare", "/about", "/pricing", "/terms", "/privacy", "/refunds", "/contact"].map((path) => ({
    url: `https://jobpipe.in${path}`,
    // Guides say when their text last changed, so search engines know to read them again.
    ...(guides.includes(path) && { lastModified: GUIDES_UPDATED }),
    changeFrequency: "monthly",
    priority: path ? 0.5 : 1,
  }));
  // One page per open role on the guides; they come and go as companies post and close them.
  // The role list is a saved copy up to 6 hours old; ask fresh which are still up, so taken-down roles (58 of 231 on 16 Nov) aren't listed.
  const all = await allGuideRoles();
  const live = await stillUp(all.map((j) => j.externalId));
  const roles = all.filter((j) => !live || live.has(j.externalId)).map((j) => ({
    url: `https://jobpipe.in${roleHref(j)}`,
    ...(j.postedAt && !Number.isNaN(Date.parse(j.postedAt)) && { lastModified: j.postedAt }),
    changeFrequency: "daily" as const,
    priority: 0.4,
  }));
  return [...pages, index, ...roles];
}
