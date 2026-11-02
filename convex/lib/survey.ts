// When to ask people how JobPipe is going: a short pop-up at the moments the answer is useful,
// never more than one at a time, and never twice for the same question.

const DAY = 86_400_000;

export const SURVEY_KINDS = ["found_jobs", "recommend", "interviews"] as const;
export type SurveyKind = (typeof SURVEY_KINDS)[number];

/**
 * Day 3: did the jobs look right? Day 12: would they recommend it? Every 30 days after: any interviews?
 * Spread out on purpose: job hunting is stressful, and the first week already has the welcome and check-in emails.
 */
export const SURVEY_TIMING = { foundJobsDay: 3, recommendDay: 12, interviewsEvery: 30, minGapDays: 3 };

/** The answers each question accepts. recommend takes a 0 to 10 score instead. */
export const SURVEY_CHOICES = {
  found_jobs: ["Yes, several", "One or two", "Not yet"],
  interviews: ["Got an offer", "Got interviews", "Applied, no interviews yet", "Paused my search"],
} as const;

export type SurveyAsk = { kind: SurveyKind; round: number };

/**
 * The one question to ask now, or null.
 * startedAt is when they were let in. past is every question they've already answered or closed.
 * Each question goes once per round: closing it counts, so nobody gets asked again.
 */
export function nextSurvey(startedAt: number, now: number, past: { kind: string; round: number; at: number }[]): SurveyAsk | null {
  const day = (now - startedAt) / DAY;
  const last = Math.max(0, ...past.map((p) => p.at));
  if (now - last < SURVEY_TIMING.minGapDays * DAY) return null;
  const done = (kind: SurveyKind, round: number) => past.some((p) => p.kind === kind && p.round === round);

  // Asked from day 30 onwards, once each 30 days.
  const round = Math.floor(day / SURVEY_TIMING.interviewsEvery);
  if (round >= 1 && !done("interviews", round)) return { kind: "interviews", round };
  if (day >= SURVEY_TIMING.recommendDay && day < SURVEY_TIMING.interviewsEvery && !done("recommend", 0)) return { kind: "recommend", round: 0 };
  // Only worth asking before the day 12 question takes over.
  if (day >= SURVEY_TIMING.foundJobsDay && day < SURVEY_TIMING.recommendDay && !done("found_jobs", 0)) return { kind: "found_jobs", round: 0 };
  return null;
}
