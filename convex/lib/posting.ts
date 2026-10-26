// Is a posting still open, and is it a real opening? Both are worked out without AI, so they cost nothing.
// Used by the server (the live check before writing a CV) and by the job page (the warnings).

const DAY = 86_400_000;

/** Below this best fit score, the app tells you to skip the job. You can still write it anyway. */
export const SKIP_BELOW = 60;

/** A live check older than this is done again before writing a CV. */
export const RECHECK_AFTER = DAY;

/** Words a job page shows once the role is closed. */
const CLOSED = [
  /no longer (accepting applications|available|open|active|exists?)/i,
  /(position|role|job|vacancy|opening|posting|requisition) (has been|was|is) (filled|closed|removed|taken down|expired)/i,
  /this (job|position|posting|role|vacancy) (has )?(expired|closed|ended)/i,
  /(job|position|page|posting) (not found|could not be found|doesn'?t exist|does not exist)/i,
  /applications? (for this (job|role|position) )?(are|is) (now )?closed/i,
  /we('re| are) no longer (hiring|recruiting) for this/i,
];

/** Reads a job page's status and text: "closed" only on clear signs, "unknown" when the site wouldn't answer. */
export function readLive(status: number, text: string, redirectedAway: boolean): { state: "open" | "closed" | "unknown"; note: string } {
  if (status === 404 || status === 410) return { state: "closed", note: "The job's page is gone." };
  // Sites that build the page in the browser send almost no text; that says nothing either way.
  if (status >= 400 || text.length < 200) return { state: "unknown", note: "The site didn't let us look. Open the posting to check." };
  // Only the top of the page: footers and "similar jobs" lists often hold these words for other roles.
  const top = text.slice(0, 6000);
  const hit = CLOSED.map((r) => top.match(r)?.[0]).find(Boolean);
  if (hit) return { state: "closed", note: `The page says "${hit}".` };
  if (redirectedAway) return { state: "closed", note: "The link now goes to the careers home page, not this job." };
  return { state: "open", note: "The posting is still up." };
}

/** True when a link that pointed at one job now lands on a page with no job in its address. */
export function sentHome(asked: string, landed: string) {
  try {
    const a = new URL(asked);
    const b = new URL(landed);
    if (a.href === b.href) return false;
    // Greenhouse and Lever add ?error=true or drop the job id when a role closes.
    if (/[?&]error=true/.test(b.search)) return true;
    const jobId = (u: URL) => u.pathname.match(/\d{4,}|[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0];
    return !!jobId(a) && !jobId(b);
  } catch {
    return false;
  }
}

/** Phrases used when a company collects CVs with no real opening behind them. */
const EVERGREEN = /\b(talent (pool|community|network|pipeline)|future (opportunities|openings|roles)|evergreen|general application|expression of interest|always (looking|hiring|on the lookout)|pipeline (role|requisition|for future))\b/i;

export type Ghost = { level: "none" | "some" | "likely"; signs: string[] };

/**
 * Signs a posting may not lead to a hire: up for months, put up again and again, or collecting CVs for later.
 * Observations, not a verdict: one sign is common on real jobs too.
 */
export function ghostSigns(
  job: { postedAt?: string; description?: string; liveCheck?: { state: string } },
  sighting: { firstSeen: number; reposts: number } | null,
  now: number,
): Ghost {
  const signs: string[] = [];
  const posted = job.postedAt ? new Date(job.postedAt).getTime() : NaN;
  // The careers board's own record beats the posted date, which a repost resets.
  const since = Math.min(Number.isFinite(posted) ? posted : now, sighting?.firstSeen ?? now);
  const days = Math.floor((now - since) / DAY);
  if (days >= 60) signs.push(`Up for ${days} days. Roles open this long are often filled already, on hold, or kept up to collect CVs.`);
  if (sighting && sighting.reposts >= 1) {
    signs.push(`Taken down and put up again ${sighting.reposts === 1 ? "once" : `${sighting.reposts} times`}. A role that keeps coming back may be hard to fill, or not really open.`);
  }
  const text = job.description ?? "";
  const evergreen = text.match(EVERGREEN)?.[0];
  if (evergreen) signs.push(`The post mentions "${evergreen}", which usually means CVs are gathered for later, not for a role open now.`);
  if (text && text.length < 500) signs.push("The description is very short, with few details about the actual work.");
  const level = signs.length === 0 ? "none" : signs.length === 1 && !evergreen ? "some" : "likely";
  return { level, signs };
}

/** Why the app says to skip a job, or null when it's worth writing for. */
export function skipReason(job: { scores?: { score: number }[]; brief?: { blocker?: string }; liveCheck?: { state: string; note: string } }) {
  if (job.liveCheck?.state === "closed") return `This posting looks closed. ${job.liveCheck.note}`;
  if (job.brief?.blocker) return `A hard blocker: ${job.brief.blocker}`;
  const best = Math.max(-1, ...(job.scores ?? []).map((s) => s.score));
  if (best >= 0 && best < SKIP_BELOW) return `Your best fit is ${best}, under the line of ${SKIP_BELOW}. Your time is better spent on a stronger match.`;
  return null;
}
