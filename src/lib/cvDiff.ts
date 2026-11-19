// "What changed": the tailored CV next to the master CV it was written from, line by line, so a person can check
// nothing was made up before sending it (no bigger claims than the master CV). Pure, runs in the browser, no AI.

export type CvLike = {
  headline: string;
  summary: string;
  experience: { id: string; company: string; role: string; bullets: string[] }[];
};

/** same: word for word in the master; reworded: close to a master line (shown as "was"); new: no close master line. */
export type LineKind = "same" | "reworded" | "new";
export type Line = { text: string; kind: LineKind; was?: string };
export type RoleDiff = { company: string; role: string; lines: Line[]; leftOut: string[]; newRole: boolean };
export type CvDiff = { headline: Line; summary: Line; roles: RoleDiff[]; counts: Record<LineKind, number> & { leftOut: number } };

/** Below this share of shared words a tailored line counts as new rather than a rewording of a master line. */
export const REWORDED_FROM = 0.5;

const STOP = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from", "as", "into", "across", "through"]);

/** The words that carry meaning, lowercased, numbers kept as they are ("143%", "$5.6m"). */
export function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}%$.+\s-]/gu, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, ""))
      .filter((w) => w && !STOP.has(w)),
  );
}

/** How much of the shorter line the other one shares, 0 to 1. */
export function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** One tailored line against the master lines it could have come from. */
export function compareLine(text: string, master: string[]): Line {
  if (master.some((m) => norm(m) === norm(text))) return { text, kind: "same" };
  let best = "";
  let score = 0;
  for (const m of master) {
    const s = overlap(text, m);
    if (s > score) {
      score = s;
      best = m;
    }
  }
  return score >= REWORDED_FROM ? { text, kind: "reworded", was: best } : { text, kind: "new" };
}

const roleKey = (r: { company: string; role: string }) => `${norm(r.company)}|${norm(r.role)}`;

/** The tailored CV, role by role, against the master CV. */
export function diffCv(tailored: CvLike, master: CvLike): CvDiff {
  const byId = new Map(master.experience.map((e) => [e.id, e]));
  const byKey = new Map(master.experience.map((e) => [roleKey(e), e]));
  const allMaster = master.experience.flatMap((e) => e.bullets);
  const counts = { same: 0, reworded: 0, new: 0, leftOut: 0 };
  const tally = (l: Line) => (counts[l.kind]++, l);

  const roles = tailored.experience.map((t) => {
    const m = byId.get(t.id) ?? byKey.get(roleKey(t)) ?? master.experience.find((e) => norm(e.company) === norm(t.company));
    // A bullet may move between roles of the same CV; compare with the role first, then the whole CV.
    const lines = t.bullets.map((b) => {
      const own = compareLine(b, m?.bullets ?? []);
      return tally(own.kind === "new" ? compareLine(b, allMaster) : own);
    });
    const used = new Set(lines.flatMap((l) => (l.kind === "same" ? [norm(l.text)] : l.was ? [norm(l.was)] : [])));
    const leftOut = (m?.bullets ?? []).filter((b) => !used.has(norm(b)));
    counts.leftOut += leftOut.length;
    return { company: t.company, role: t.role, lines, leftOut, newRole: !m };
  });

  const one = (t: string, m: string): Line => tally(norm(t) === norm(m) ? { text: t, kind: "same" } : overlap(t, m) >= REWORDED_FROM ? { text: t, kind: "reworded", was: m } : { text: t, kind: "new", was: m || undefined });
  return { headline: one(tailored.headline, master.headline), summary: one(tailored.summary, master.summary), roles, counts };
}

/** Numbers in a line that aren't anywhere in the master CV: the ones to check first. */
export function newNumbers(text: string, master: CvLike): string[] {
  const all = [master.headline, master.summary, ...master.experience.flatMap((e) => [e.role, ...e.bullets])].join(" ");
  const have = new Set(all.match(/\d[\d.,]*/g) ?? []);
  return (text.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, "")).filter((n) => !have.has(n) && ![...have].some((h) => h.replace(/[.,]+$/, "") === n));
}
