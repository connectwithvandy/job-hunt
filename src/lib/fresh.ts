/**
 * "New to you": a job the last day's searches found that you haven't acted on. The same rule on Today's summary line,
 * the "New to you since yesterday" group on Jobs and the "New to you" tag, so the numbers agree (27 Nov 2026 review).
 * Found, not posted: a board can hand over a month-old posting, and "New · Posted 1 month ago" read as a contradiction.
 */
export const NEW_FOR_MS = 86_400_000;

export const isNewJob = (j: { status: string; _creationTime: number }, now: number) => j.status === "new" && now - j._creationTime < NEW_FOR_MS;
