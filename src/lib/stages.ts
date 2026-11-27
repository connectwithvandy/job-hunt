/**
 * Stage names in a sales team's words, the same words as Today's pipeline strip (design round 1, 27 Nov 2026).
 * Only the words on screen change; the stored statuses stay as they are.
 */
export const STAGE_WORDS: Record<string, string> = {
  applying: "Proposal",
  applied: "Sent",
  screening: "Discovery",
  interview: "Meeting",
  offer: "Closed won",
  rejected: "Closed lost",
};
