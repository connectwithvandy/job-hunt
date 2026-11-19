// The owner's rule for CV rewrites: shorter or plainer, never bigger. A rewrite may drop words, but it may not
// bring in a number, a name, a tool or an employer that the original line didn't have. Checked in code, not
// trusted to the model (19 Nov: another tool's "stronger verbs" turned "Helped establish" into "Established").

const NUMBER = /\d[\d,.]*\s*[%xX]?|\$\s*\d[\d,.]*[KMB]?/g;
const digits = (s: string) => (s.match(NUMBER) ?? []).map((n) => n.replace(/[\s,$]/g, "").toLowerCase());
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z][a-z0-9+#.&'-]*/g) ?? []).map((w) => w.replace(/[.']+$/, "")));

/** Numbers in the rewrite that the original doesn't have. */
export function newNumbers(original: string, rewrite: string): string[] {
  const had = new Set(digits(original));
  return digits(rewrite).filter((n) => !had.has(n));
}

/** Capitalised words or acronyms in the rewrite (names, tools, employers, titles) that the original never used. */
export function newNames(original: string, rewrite: string): string[] {
  const had = words(original);
  const out: string[] = [];
  // A capital after a full stop just starts a sentence, so only capitals inside a sentence count as names.
  for (const sentence of rewrite.split(/(?<=[.!?:;])\s+/)) {
    const tokens = sentence.trim().split(/\s+/).slice(1);
    for (const raw of tokens) {
      const t = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#]+$/g, "");
      if (/^[A-Z]/.test(t) && !had.has(t.toLowerCase())) out.push(t);
    }
  }
  return out;
}

// Words that say you shared the work. Dropping one turns "helped build" into "built", a bigger claim.
const SHARED = ["helped", "supported", "contributed", "assisted", "partnered", "co-led", "co-founded", "with the team", "alongside", "as part of"];

/** Words like "helped" or "contributed" that the original has and the rewrite dropped. */
export function droppedCredit(original: string, rewrite: string): string[] {
  const a = original.toLowerCase();
  const b = rewrite.toLowerCase();
  return SHARED.filter((w) => a.includes(w) && !b.includes(w));
}

/** Why a rewrite can't be used, or null when it only says what the original said. */
export function rewriteProblem(original: string, rewrite: string): string | null {
  if (!rewrite.trim()) return "The rewrite came back empty.";
  const nums = newNumbers(original, rewrite);
  if (nums.length) return `It added numbers your line doesn't have (${nums.join(", ")}).`;
  const names = newNames(original, rewrite);
  if (names.length) return `It added words your line doesn't have (${names.join(", ")}).`;
  const credit = droppedCredit(original, rewrite);
  if (credit.length) return `It dropped "${credit[0]}", which would claim more than your line does.`;
  if (rewrite.length > original.length * 1.1 + 10) return "It came back longer than your line.";
  return null;
}
