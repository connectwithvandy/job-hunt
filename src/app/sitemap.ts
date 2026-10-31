import type { MetadataRoute } from "next";
import { ROLE_PAGES } from "@/lib/rolePages";

export default function sitemap(): MetadataRoute.Sitemap {
  const guides = ["/sales-jobs", ...ROLE_PAGES.map((r) => `/sales-jobs/${r.slug}`)];
  return ["", "/cv-review", ...guides, "/pricing", "/terms", "/privacy", "/refunds", "/contact"].map((path) => ({
    url: `https://jobpipe.in${path}`,
    changeFrequency: "monthly",
    priority: path ? 0.5 : 1,
  }));
}
