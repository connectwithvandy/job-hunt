import type { MetadataRoute } from "next";
import { allGuideRoles, roleHref } from "@/lib/guideRoles";
import { GUIDES_UPDATED, ROLE_PAGES } from "@/lib/rolePages";

// The role pages change daily, so the sitemap is rebuilt at most once a day too.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = ["/sales-jobs", ...ROLE_PAGES.map((r) => `/sales-jobs/${r.slug}`)];
  const pages: MetadataRoute.Sitemap = ["", "/cv-review", ...guides, "/compare", "/about", "/pricing", "/terms", "/privacy", "/refunds", "/contact"].map((path) => ({
    url: `https://jobpipe.in${path}`,
    // Guides say when their text last changed, so search engines know to read them again.
    ...(guides.includes(path) && { lastModified: GUIDES_UPDATED }),
    changeFrequency: "monthly",
    priority: path ? 0.5 : 1,
  }));
  // One page per open role on the guides; they come and go as companies post and close them.
  const roles = (await allGuideRoles()).map((j) => ({
    url: `https://jobpipe.in${roleHref(j)}`,
    ...(j.postedAt && !Number.isNaN(Date.parse(j.postedAt)) && { lastModified: j.postedAt }),
    changeFrequency: "daily" as const,
    priority: 0.4,
  }));
  return [...pages, ...roles];
}
