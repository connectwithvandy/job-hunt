// The free week: it starts when the owner lets someone in. Nobody is locked out when it ends (yet).
import { PLANS } from "./plans";

const DAY = 86_400_000;

/** When someone's free week ends, or null for people with no let-in date. */
export function trialEnd(row: { approved: boolean; decidedAt?: number; welcomedAt?: number } | null) {
  const start = row?.approved ? (row.decidedAt ?? row.welcomedAt) : undefined;
  return start ? start + PLANS.trialDays * DAY : null;
}

/** The check-in goes two days before the end, and not to anyone whose week ended more than two days ago. */
export function checkInDue(end: number, now: number) {
  return now >= end - 2 * DAY && now < end + 2 * DAY;
}
