import type { Infer } from "convex/values";
import type { resumeV } from "./validators";

type Resume = Infer<typeof resumeV>;

/** The fact gate: every number in tailored text must exist somewhere in the master CV, or in `extra` (facts you gave the AI yourself). */
export function unverifiedNumbers(master: Resume | Resume[], texts: string[], extra: string[] = []) {
  const haystack = (JSON.stringify(master) + extra.join(" ")).replace(/[\s,]/g, "").toLowerCase();
  const found = new Set<string>();
  for (const text of texts) {
    // "8+" and "6 months" are checked whole, so a single digit like "8+ years" can't slip through.
    for (const m of text.matchAll(/[$₹]?\d[\d,.]*\s?(?:%|x|X|M|K|Cr|\+)?(?:\s?(?:years?|months?|weeks?|days?)\b)?/g)) {
      const token = m[0].replace(/[\s,]/g, "").replace(/\.$/, "").toLowerCase();
      if (token.length < 2 && !/%/.test(token)) continue;
      // The length of the call a cover letter or email asks for ("a 15-minute call") isn't a claim about you
      // (23 Nov walk: "15 isn't in your master CV" showed on a CV that has no 15 in it).
      if (/^[-\s]?min(?:ute)?s?\s+(?:call|chat|conversation|meeting)\b/i.test(text.slice(m.index + m[0].length))) continue;
      if (!haystack.includes(token)) found.add(m[0].trim());
    }
  }
  return [...found];
}

/** Puts the checker's fixed bullets in place; a fix pointing at a role or bullet that isn't there is ignored. */
export function applyBulletFixes<E extends { id: string; bullets: string[] }>(experience: E[], fixes: { id: string; index: number; text: string }[]) {
  const renamed = new Map<string, string>();
  const next = experience.map((e) => {
    const mine = fixes.filter((f) => f.id === e.id && Number.isInteger(f.index) && f.index >= 0 && f.index < e.bullets.length && f.text.trim());
    if (!mine.length) return e;
    const bullets = [...e.bullets];
    for (const f of mine) {
      renamed.set(bullets[f.index], f.text.trim());
      bullets[f.index] = f.text.trim();
    }
    return { ...e, bullets };
  });
  return { experience: next, renamed };
}
