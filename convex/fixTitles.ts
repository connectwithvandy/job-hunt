// One-off fixes to people's saved role titles.
// npx convex run --prod fixTitles:dropSalesExecutive '{"dryRun":true}'   then without dryRun.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Takes "Sales Executive" out of everyone's Account Executive role (17 Nov 2026). It matched every inside, field and
 * corporate sales executive in India, so AE people got hundreds of junior non-SaaS jobs and few real AE roles.
 * Only the exact title goes; titles people typed themselves, like "Enterprise Sales Executive", stay.
 */
export const dropSalesExecutive = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({ tracks: v.number(), changed: v.number() }),
  handler: async (ctx, { dryRun }) => {
    let tracks = 0;
    let changed = 0;
    for await (const t of ctx.db.query("tracks")) {
      if (t.key !== "account-executive" && t.name !== "Account Executive") continue;
      tracks++;
      const titles = t.titles.filter((x) => x.trim().toLowerCase() !== "sales executive");
      if (titles.length === t.titles.length || !titles.length) continue;
      changed++;
      if (!dryRun) await ctx.db.patch("tracks", t._id, { titles });
    }
    return { tracks, changed };
  },
});
