// Which saved jobs can be deleted for good (21 Nov 2026, owner's call): ~150,000 jobs were kept forever, and the
// morning search and page loads read through them. Only jobs nobody touched, found a while ago, and dead or old.
import type { Doc } from "../_generated/dataModel";

const DAY = 86_400_000;
/** Found more recently than this: kept, even if closed (owner: "not recent ones"). */
export const KEEP_FOUND_DAYS = 30;
/** Posted longer ago than this: as good as gone, even if the posting is still up. */
export const STALE_POSTED_DAYS = 90;

/**
 * True for a job nobody acted on (not saved, starred, tailored, sent, applied to, marked "not for me", nor tied to an
 * email or interview) that JobPipe found 30+ days ago and that is closed or was posted 90+ days ago.
 */
export function isStale(j: Doc<"jobs">, now: number) {
  if (j.status !== "new") return false;
  if (j.favorite || j.pack || j.hasPack || j.hasSent || j.appliedAt || j.lastEmail || j.research || j.prep) return false;
  // Lists start empty, so only a filled one means someone acted (skipped = contacts they passed over).
  if (j.outreach?.length || j.skipped?.length || j.hiringContacts?.length) return false;
  if (now - j._creationTime < KEEP_FOUND_DAYS * DAY) return false;
  if (j.liveCheck?.state === "closed") return true;
  const posted = j.postedAt ? Date.parse(j.postedAt) : NaN;
  return !Number.isNaN(posted) && now - posted > STALE_POSTED_DAYS * DAY;
}
