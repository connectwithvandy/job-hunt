/**
 * One stage vocabulary for the whole app: Today's pipeline strip, the Applications board, the job page's stage chip.
 * Sales words, in pipeline order, each with a plain hint. Only the words on screen change; stored statuses stay.
 * (27 Nov 2026 review: Today and Applications used different stages and counted them differently.)
 */
export type Stage = { key: string; word: string; hint: string; status: string };

export const STAGES: Stage[] = [
  { key: "prospect", status: "new", word: "Prospect", hint: "open jobs" },
  { key: "qualified", status: "new", word: "Qualified", hint: "of them 60+" },
  { key: "applying", status: "applying", word: "Proposal", hint: "CV ready" },
  { key: "applied", status: "applied", word: "Sent", hint: "applied" },
  { key: "screening", status: "screening", word: "Discovery", hint: "recruiter call" },
  { key: "interview", status: "interview", word: "Meeting", hint: "interview" },
  { key: "offer", status: "offer", word: "Closed won", hint: "offer" },
  { key: "rejected", status: "rejected", word: "Closed lost", hint: "no or dropped" },
];

/** A stored status in stage words: "applied" → "Sent". */
export const STAGE_WORDS: Record<string, string> = {
  new: "Prospect",
  ...Object.fromEntries(STAGES.filter((s) => s.status !== "new").map((s) => [s.status, s.word])),
  dismissed: "Not for me",
};

/** A stored status's plain hint: "applied" → "applied". */
export const STAGE_HINT: Record<string, string> = Object.fromEntries(STAGES.filter((s) => s.status !== "new").map((s) => [s.status, s.hint]));

/** How many jobs one "Score top" tap scores, on Today and Jobs alike. */
export const SCORE_BATCH = 5;
