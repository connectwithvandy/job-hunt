import type { MetadataRoute } from "next";
import { GUIDES_UPDATED, ROLE_PAGES } from "@/lib/rolePages";

export default function sitemap(): MetadataRoute.Sitemap {
  const guides = ["/sales-jobs", ...ROLE_PAGES.map((r) => `/sales-jobs/${r.slug}`)];
  return ["", "/cv-review", ...guides, "/compare", "/about", "/pricing", "/terms", "/privacy", "/refunds", "/contact"].map((path) => ({
    url: `https://jobpipe.in${path}`,
    // Guides say when their text last changed, so search engines know to read them again.
    ...(guides.includes(path) && { lastModified: GUIDES_UPDATED }),
    changeFrequency: "monthly",
    priority: path ? 0.5 : 1,
  }));
}
