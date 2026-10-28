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
      if (!haystack.includes(token)) found.add(m[0].trim());
    }
  }
  return [...found];
}
