// When a message that got no reply needs a follow-up. No AI, so Today and Messages can show it for free.
// Over half of replies come to a follow-up, not the first message; more than two starts to annoy.

const DAY = 86_400_000;

/** A week between the first message and each follow-up. */
export const FOLLOW_UP_AFTER = 7 * DAY;
export const MAX_FOLLOW_UPS = 2;

type Thread = { sentAt?: number; replied: boolean; followUps?: { sentAt?: number }[] };

/** The next follow-up for a sent message: which one (1 or 2), and from when it's due. Null when replied, unsent, or done. */
export function nextFollowUp(t: Thread): { n: number; dueAt: number } | null {
  if (!t.sentAt || t.replied) return null;
  const sent = (t.followUps ?? []).filter((f) => f.sentAt);
  if (sent.length >= MAX_FOLLOW_UPS) return null;
  return { n: sent.length + 1, dueAt: (sent.at(-1)?.sentAt ?? t.sentAt) + FOLLOW_UP_AFTER };
}

/** How many sent messages got a reply, split by whether the reply came to the first message or a follow-up. */
export function replyTiming(threads: (Thread & { replied: boolean })[]) {
  let sent = 0;
  let toFirst = 0;
  let toFollowUp = 0;
  for (const t of threads) {
    if (!t.sentAt) continue;
    sent++;
    if (!t.replied) continue;
    if ((t.followUps ?? []).some((f) => f.sentAt)) toFollowUp++;
    else toFirst++;
  }
  return { sent, toFirst, toFollowUp };
}
