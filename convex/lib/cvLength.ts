// How long a CV runs, and an opt-in way to fit a tailored copy on two pages.
// Pure code with no Convex imports, so the page, the server and the tests all use the same numbers.
//
// The estimate models the one-column layout (the default since 22 Nov): A4, 10pt text, 1.4 line height,
// 13mm margins, so about 54 lines of about 100 characters a page. It's a guide, not a print preview.

/** The parts of a CV that take up room on the page. Same shape as a saved CV, so a saved one can be passed straight in. */
export type CvShape = {
  headline: string;
  summary: string;
  contact: { phone: string; email: string; location: string; linkedin: string; links?: string[] };
  experience: { blurb: string; bullets: string[] }[];
  education: { school: string; degree: string; detail: string; notes: string[] }[];
  certifications: { name: string; detail: string }[];
  skills: { technical: string[]; soft: string[] };
  extras: { title: string; items: { heading: string; text: string }[] }[];
};

const LINES_PER_PAGE = 54;
const CHARS_PER_LINE = 100;
/** A section heading, with the space above and below it. */
const HEADING = 2;

const linesOf = (text: string, width = CHARS_PER_LINE) => (text.trim() ? Math.ceil(text.trim().length / width) : 0);
/** A list item: its lines and the small gap after it. */
const itemLines = (text: string) => linesOf(text, CHARS_PER_LINE - 4) + 0.15;
const extraLines = (title: string, it: { heading: string; text: string }) =>
  itemLines(it.heading && it.heading.trim().toLowerCase() !== title.trim().toLowerCase() ? `${it.heading}: ${it.text}` : it.text);

/** About how many A4 pages the CV fills, to one decimal. */
export function estimatePages(cv: CvShape) {
  let lines = 3 + linesOf(cv.headline) + linesOf([cv.contact.phone, cv.contact.email, cv.contact.location, cv.contact.linkedin, ...(cv.contact.links ?? [])].filter(Boolean).join(" · "));
  if (cv.summary.trim()) lines += HEADING + linesOf(cv.summary);
  if (cv.experience.length) lines += HEADING;
  for (const e of cv.experience) lines += 2.7 + linesOf(e.blurb) + e.bullets.reduce((n, b) => n + itemLines(b), 0);
  if (cv.education.length) lines += HEADING;
  for (const ed of cv.education) lines += 2 + linesOf(ed.detail) + ed.notes.reduce((n, x) => n + itemLines(x), 0) + 0.5;
  if (cv.certifications.length) lines += HEADING + cv.certifications.reduce((n, c) => n + 1 + linesOf(c.detail) + 0.3, 0);
  if (cv.skills.technical.length || cv.skills.soft.length) lines += HEADING + linesOf(cv.skills.technical.join(" · ")) + linesOf(cv.skills.soft.join(" · "));
  for (const x of cv.extras) if (x.items.length) lines += HEADING + x.items.reduce((n, it) => n + extraLines(x.title, it), 0);
  return Math.round((lines / LINES_PER_PAGE) * 10) / 10;
}

/** Above this, the CV page offers to fit the tailored copy on two pages. A little slack, since it's an estimate. */
export const TWO_PAGES = 2.1;

const STOP = new Set(
  "with from that this have their they your will what when where which while about into over under than then them more most other such also only very each both just were been being does done make made team role work years year across".split(" "),
);

function wordSet(text: string) {
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? []).map((w) => w.replace(/[.-]+$/, "")).filter((w) => !STOP.has(w)));
}

type Candidate = { kind: "extra" | "note"; section: number; index: number; label: string; group: string; lines: number; score: number };

/**
 * The member's own choice, from "Fit it on two pages": leaves out the side items least related to this job
 * (extras like side projects and communities, then education notes) until the CV fits two pages, and
 * says in plain words what went. The experience, summary, skills and certifications are never touched,
 * and nothing is reworded. Returns the CV unchanged when it already fits, and when leaving out every side
 * item still wouldn't get it to two pages (then the experience is what's long, and cutting extras only loses them).
 */
export function fitTwoPages<T extends CvShape>(cv: T, jobText: string): { resume: T; left: string[]; pages: number } {
  const start = estimatePages(cv);
  if (start <= 2) return { resume: cv, left: [], pages: start };
  const job = wordSet(jobText);
  const relevance = (text: string, lines: number) => {
    let hits = 0;
    for (const w of wordSet(text)) if (job.has(w)) hits++;
    return hits / Math.max(lines, 1);
  };

  const pool: Candidate[] = [];
  cv.extras.forEach((x, s) =>
    x.items.forEach((it, i) => {
      const lines = extraLines(x.title, it);
      pool.push({ kind: "extra", section: s, index: i, label: it.heading || it.text, group: x.title, lines, score: relevance(`${it.heading} ${it.text}`, lines) });
    }),
  );
  cv.education.forEach((ed, s) =>
    ed.notes.forEach((n, i) => {
      const lines = itemLines(n);
      // Notes from school matter least once there's a career, so they go before an equally related side item.
      pool.push({ kind: "note", section: s, index: i, label: n, group: `${ed.school} notes`, lines, score: relevance(n, lines) - 0.01 });
    }),
  );
  // Least related to the job first; among equals, the ones listed later (usually the lesser ones) first.
  pool.sort((a, b) => a.score - b.score || b.index - a.index);

  if (estimatePages(apply(cv, new Set(pool))) > 2) return { resume: cv, left: [], pages: start };
  const drop = new Set<Candidate>();
  let pages = start;
  for (const c of pool) {
    if (pages <= 2) break;
    drop.add(c);
    pages = estimatePages(apply(cv, drop));
  }
  const resume = apply(cv, drop);

  // One plain line per section: what was left out, and what was kept.
  const left: string[] = [];
  const groups = new Map<string, Candidate[]>();
  for (const c of drop) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  for (const [group, cs] of groups) {
    const total = cs[0].kind === "extra" ? cv.extras[cs[0].section].items.length : cv.education[cs[0].section].notes.length;
    const names = cs.sort((a, b) => a.index - b.index).map((c) => `"${clip(c.label)}"`).join(", ");
    left.push(`${group}: left out ${names} (kept ${total - cs.length} of ${total})`);
  }
  return { resume, left, pages: estimatePages(resume) };
}

function apply<T extends CvShape>(cv: T, drop: Set<Candidate>): T {
  const gone = (kind: Candidate["kind"], section: number, index: number) => [...drop].some((c) => c.kind === kind && c.section === section && c.index === index);
  return {
    ...cv,
    extras: cv.extras.map((x, s) => ({ ...x, items: x.items.filter((_, i) => !gone("extra", s, i)) })).filter((x) => x.items.length),
    education: cv.education.map((ed, s) => ({ ...ed, notes: ed.notes.filter((_, i) => !gone("note", s, i)) })),
  };
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
