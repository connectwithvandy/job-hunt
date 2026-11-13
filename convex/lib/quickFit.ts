// A free first guess at fit, worked out when a job is saved, with no AI call. It ranks the list until
// the AI score arrives, and decides which jobs the AI scores first.

import type { Infer } from "convex/values";
import { jobMode } from "./defaults";
import { placeFit } from "./places";
import { backOffice, otherFunction, titleMatches } from "./salesRoles";
import type { resumeV } from "./validators";

type Resume = Infer<typeof resumeV>;

const STOP = new Set(
  "with from that this have will your their they them were been into over more than such also about across which while where when what team teams work working role roles years year experience strong ability using including within other each both well very make made help helped across company companies business".split(" "),
);

const words = (text: string) => new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

/** The words of any text, as the fit guess counts them: for a CV read straight from its file. */
export const textWords = (text: string) => words(text);

/** Five years and more between the earliest and latest year in a CV's text (Present counts as this year). */
export function textSenior(text: string, year = new Date().getFullYear()) {
  const years = [...(text.match(/\b(19[89]\d|20[0-4]\d)\b/g) ?? []).map(Number), ...(/\b(present|current)\b/i.test(text) ? [year] : [])].filter((y) => y <= year);
  return years.length > 1 && Math.max(...years) - Math.min(...years) >= 5;
}

/** The CV's own vocabulary: skills, roles, headline and achievements. */
export function cvWords(cv: Resume) {
  return words(
    [cv.headline, cv.summary, ...cv.skills.technical, ...cv.skills.soft, ...cv.experience.flatMap((e) => [e.role, e.blurb, ...e.bullets])].join(" "),
  );
}

/**
 * True when the CV shows a senior career: a manager, lead or senior title, or five years and more of work.
 * Years come from the experience dates, like "Jan 2017" to "Present".
 */
export function cvSenior(cv: Resume, year = new Date().getFullYear()) {
  if (cv.experience.some((e) => SENIOR_ROLE.test(e.role))) return true;
  const years = (t: string) => (/present|current|now/i.test(t) ? [year] : (t.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number));
  const starts = cv.experience.flatMap((e) => years(e.start));
  const ends = cv.experience.flatMap((e) => years(e.end));
  return starts.length > 0 && ends.length > 0 && Math.max(...ends) - Math.min(...starts) >= 5;
}
// "Lead generation" is an entry job, not a lead's.
const SENIOR_ROLE = /\b(senior|sr|manager|lead(?!\s*gen)|leader|head|director|vp|vice president|principal|chief)\b/i;

/** A job meant for someone starting out: "Fresher", "Apprentice", "Intern", "Entry level", "0-1 years". */
export function juniorTitle(title: string) {
  return JUNIOR_TITLE.test(title.replace(/_/g, " ")) || /\b0\s*(-|–|to)\s*[12]\+?\s*(years?|yrs?)\b/i.test(title);
}
const LEADER_TITLE = /\b(director|vp|vice president|head of|chief|cro|avp)\b/i;
const JUNIOR_TITLE =/\b(freshers?|apprentices?|apprenticeship|interns?|internship|trainees?|graduates?|entry[\s-]level|junior|jr)\b/i;

/**
 * 0 to 100: title against the track titles (50), CV words found in the job (35), and place (15).
 * `home` is where the person wants to work, as saved: "Bengaluru, Pune", "India", "Remote" or "Anywhere".
 * `modes` is the work types they picked (onsite, hybrid, remote). A job outside their place or work type
 * stays low whatever its title, because the AI score marks those as ones to skip (13 Nov: 66% of guesses
 * of 70+ were scored under 60 by the AI, most of them roles abroad).
 */
export function quickFit(...args: Parameters<typeof quickFitParts>) {
  const p = quickFitParts(...args);
  return typeof p === "number" ? p : combineFit(p);
}

/** The pieces of the guess, kept apart so they can be checked against AI scores. A number is a final answer. */
export function quickFitParts(
  job: { title: string; company?: string; description?: string; location: string; workSetting?: string },
  vocab: Set<string>,
  titles: string[],
  home: string,
  senior = false,
  modes?: string[],
) {
  // An accounts or payroll job shares words with "Account Executive" but none of the work.
  if (backOffice(job.title) && !titles.some(backOffice)) return 5;
  const norm = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim()} `;
  const title = norm(job.title);
  const titleShare = Math.max(
    0,
    ...titles.map((t) => {
      // An engineer or product manager job doesn't fit a sales role, whatever words they share.
      if (otherFunction(t, job.title)) return 0;
      const want = norm(t);
      // The whole phrase ("business operations") counts fully; the words scattered about count less.
      if (title.includes(want)) return 1;
      // Every word in another order, or a leader title worded differently: "Manager - Sales Development, India".
      if (titleMatches(t, job.title)) return 0.9;
      const parts = want.trim().split(" ").filter(Boolean);
      const found = parts.filter((w) => title.includes(` ${w} `)).length;
      return found === parts.length ? 0.6 : (found / Math.max(1, parts.length)) * 0.3;
    }),
  );
  const jobWords = words(`${job.title} ${job.description ?? ""}`);
  const shared = [...vocab].filter((w) => jobWords.has(w)).length;
  // Forty-five shared words is about as good as it gets; a job with no description can only reach part way.
  const cvShare = Math.min(1, shared / 45);
  const place = placeFit(job, home);
  // Not open to where they want to work, or not a work type they picked: shown low, so it's never a top pick.
  const mode = jobMode(job.location, job.workSetting, job.title);
  const wrongMode = !!modes?.length && modes.length < 3 && mode !== "unknown" && !modes.includes(mode);
  const reach = place === 0 ? 0.35 : wrongMode ? 0.5 : 1;
  // A role for speakers of another language says so in the title: "Account Executive - Spanish".
  const language = LANGUAGE.test(job.title) ? 0.4 : 1;
  // A sales job at a hotel, bank or builder shares the title but not the work: a full description
  // that never mentions software or SaaS counts for less.
  const desc = job.description ?? "";
  // Banks and lenders often post with no description, so their name or title gives them away.
  const lender = isLender(job.title, job.company);
  const industry = lender || (desc.length > 400 && !TECH.test(`${job.title} ${desc}`)) ? 0.6 : 1;
  // Any long description shares plenty of CV words, so they count fully only when the title fits too:
  // a bank's "Acquisition Manager" in Bengaluru shouldn't reach the apply list on words and place alone.
  const cvWeight = titleShare >= 0.6 ? 35 : 15;
  // A fresher or apprentice job shares the title but not the level: for someone years in, it's a poor fit.
  // And the other way: a director or VP role for a CV that shows no senior title and under five years.
  const level = senior && juniorTitle(job.title) ? 0.5 : !senior && vocab.size > 0 && LEADER_TITLE.test(job.title) ? 0.6 : 1;
  return { titleShare, shared, cvShare, cvWeight, place, language, industry, level, reach };
}

export type FitParts = Exclude<ReturnType<typeof quickFitParts>, number>;

export function combineFit(p: FitParts) {
  return Math.round((p.titleShare * 50 + p.cvShare * p.cvWeight + p.place * 15) * p.language * p.industry * p.level * p.reach);
}

// A bank or lender by name, and lending products by title. A title alone saying "Banking" is often a tech
// company's team that sells to banks, like Salesforce's "Account Executive, Banking".
const LENDER_COMPANY = /\b(bank|nbfc|financial services|finance|finserv|lending|loans?|kotak|hdfc|icici|sbi|indusind|idfc|bandhan|rbl|tata capital|aditya birla capital|hdb|lendingkart|protium|muthoot|manappuram|shriram|poonawalla|cholamandalam|aavas|truhome|home first)\b/i;
const LENDER_TITLE = /\b(loans?|credit cards?|motor finance|mortgages?|working capital|business banking|nbfc|casa)\b/i;

/** A sales job at a bank or lender. */
export function isLender(title: string, company = "") {
  const t = title.replace(/_/g, " ");
  return (LENDER_COMPANY.test(company.replace(/_/g, " ")) || LENDER_TITLE.test(t)) && !TECH.test(t);
}
const TECH = /\b(saas|b2b|software|cloud|api|apis|startup|subscription|arr|cybersecurity|devops|martech|fintech|edtech|ai|artificial intelligence|machine learning|tech (company|startup|platform)|technology (company|platform))\b/i;

const LANGUAGE = /\b(spanish|french|german|italian|portuguese|dutch|japanese|korean|mandarin|chinese|cantonese|arabic|turkish|polish|russian|swedish|danish|norwegian|finnish|hebrew|thai|vietnamese|indonesian|bahasa)\b|\b(dach|nordics|benelux)\b/i;
