// Which preset roles a CV's recent job titles point to, so setup can say "Fits your CV" (27 Nov walk: the roles
// screen ignored the CV, and a manager who picks only SDR / BDR gets every score under 45).
import { fullTitle, titleMatches } from "../../convex/lib/salesRoles";

type Preset = { key: string; titles: string[] };

/**
 * For each of the two latest roles, the preset with the most specific title that the job search would match to it
 * (the same matcher, so "Manager of Sales Development" counts as an SDR manager, not an SDR).
 */
export function rolesFromCv(roles: string[], presets: readonly Preset[]): string[] {
  const out: string[] = [];
  for (const role of roles.slice(0, 2)) {
    let best: { key: string; len: number } | null = null;
    for (const p of presets)
      for (const t of p.titles) {
        const len = fullTitle(t).split(" ").length;
        if (titleMatches(t, role) && (!best || len > best.len)) best = { key: p.key, len };
      }
    if (best && !out.includes(best.key)) out.push(best.key);
  }
  return out;
}
