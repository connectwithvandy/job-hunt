// One rule for "a company is waiting on your answer", shared by Today's top box and Messages' "Needs you",
// so the two never disagree (19 Nov: Messages showed JumpCloud and Airwallex invites that Today left out,
// because Today wanted a week-old email and a job already moved to screening, and Messages wanted neither).

type EmailJob = {
  status: string;
  statusSetAt?: number;
  lastEmail?: { at: number; stage: string; repliedAt?: number };
};

const DAY = 86_400_000;

/** After two weeks with no answer the invite has gone stale: the job's follow-ups take over. */
export const ANSWER_WITHIN_DAYS = 14;

/**
 * The company's latest email asks something of you (a recruiter, an interview invite or an offer),
 * you haven't answered it, it's under two weeks old, and the job isn't closed or set aside.
 */
export function waitsForAnswer(j: EmailJob, now: number): boolean {
  const e = j.lastEmail;
  if (!e || e.repliedAt) return false;
  if (e.stage !== "screening" && e.stage !== "interview" && e.stage !== "offer") return false;
  if (j.status === "rejected" || j.status === "dismissed") return false;
  return now - e.at < ANSWER_WITHIN_DAYS * DAY;
}

/** Interview invites and offers come before a recruiter's first note. */
export function answerRank(j: EmailJob): number {
  const s = j.lastEmail?.stage;
  return s === "offer" ? 0 : s === "interview" ? 1 : 2;
}

/**
 * The tracker column a job belongs in: an interview-invite email outranks a job still marked applied or screening,
 * so the card sits under Interviewing without anyone dragging it. If the person moved the card after that email
 * arrived, their choice wins, so a card dragged back to Screening stays there.
 */
export function trackerStatus(j: EmailJob): string {
  const e = j.lastEmail;
  if (e && (e.stage === "interview" || e.stage === "offer") && (j.status === "applied" || j.status === "screening") && !(j.statusSetAt && j.statusSetAt > e.at)) return e.stage === "offer" ? "offer" : "interview";
  return j.status;
}
