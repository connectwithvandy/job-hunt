import type { Infer } from "convex/values";
import type { resumeV } from "./validators";

type Resume = Infer<typeof resumeV>;

/** The fact gate: every number in tailored text must exist somewhere in the master CV. */
export function unverifiedNumbers(master: Resume | Resume[], texts: string[]) {
  const haystack = JSON.stringify(master).replace(/[\s,]/g, "");
  const found = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(/[$₹]?\d[\d,.]*\s?(?:%|x|X|M|K|Cr)?/g)) {
      const token = m[0].replace(/[\s,]/g, "").replace(/\.$/, "");
      if (token.length < 2 && !/%/.test(token)) continue;
      if (!haystack.includes(token)) found.add(m[0].trim());
    }
  }
  return [...found];
}
