// Keeps the public sitemap fresh for search engines and AI answer tools.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { appUrl } from "./lib/email";

/**
 * Opens the sitemap once an hour. Vercel rebuilds it only when someone asks for it after the hour is up, and
 * serves that person the old copy, so between search-engine visits it sat 11 hours old (24 Nov) with closed roles.
 */
export const warmSitemap = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    try {
      const res = await fetch(`${appUrl()}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) });
      await res.arrayBuffer();
      if (!res.ok) console.warn("Sitemap answered", res.status);
    } catch (err) {
      console.warn("Sitemap warm-up failed", String(err));
    }
    return null;
  },
});
