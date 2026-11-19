// One rule for "this posting is too old to bother with", shared by Jobs (the Archived list) and Today,
// so a card never says "Posted 3mo ago" in the main list (19 Nov: careers-board roles counted from when we found
// them, so a 3-month-old posting still sat at the top of Jobs and on Today).

const DAY = 86_400_000;

/** How old a posting can be before it's archived, picked in Profile → Job preferences. */
export const ARCHIVE_CHOICES = [14, 30, 45, 90] as const;
export const ARCHIVE_DAYS_DEFAULT = 45;

export function archiveLabel(days: number): string {
  return days === 14 ? "2 weeks" : days === 90 ? "3 months" : `${days} days`;
}

type PostingJob = {
  status: string;
  postedAt?: string | null;
  _creationTime: number;
  liveCheck?: { state: string } | null;
};

/** When the posting went up: the date the card shows, or when we found it if the posting gives none. */
export function postingTime(j: PostingJob): number {
  const posted = j.postedAt ? Date.parse(j.postedAt) : NaN;
  return Number.isFinite(posted) ? posted : j._creationTime;
}

/**
 * Archived: a job you haven't started that has closed, or whose posting is older than your limit.
 * Jobs you've started or applied to are never archived.
 */
export function isArchived(j: PostingJob, now: number, maxAgeDays: number = ARCHIVE_DAYS_DEFAULT): boolean {
  if (j.status !== "new") return false;
  if (j.liveCheck?.state === "closed") return true;
  return now - postingTime(j) > maxAgeDays * DAY;
}
