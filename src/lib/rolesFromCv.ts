// Which preset roles a CV's recent job titles point to, so setup can say "Fits your CV" (27 Nov walk: the roles
// screen ignored the CV, and a manager who picks only SDR / BDR gets every score under 45).

type Preset = { key: string; titles: string[] };

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** For each of the two latest roles, the preset whose title matches it most closely (longest match wins). */
export function rolesFromCv(roles: string[], presets: readonly Preset[]): string[] {
  const out: string[] = [];
  for (const role of roles.slice(0, 2)) {
    const r = words(role);
    let best: { key: string; len: number } | null = null;
    for (const p of presets)
      for (const t of p.titles) {
        const w = words(t);
        if (r.includes(w) && (!best || w.length > best.len)) best = { key: p.key, len: w.length };
      }
    if (best && !out.includes(best.key)) out.push(best.key);
  }
  return out;
}
