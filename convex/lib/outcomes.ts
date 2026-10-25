// What happened to each application, for learning which roles and scores actually get replies.
// Used by the Today page and by scoring, so both read results the same way. No AI, no cost.

export type Outcome = "response" | "rejected" | "silent";

type JobLike = { status: string; appliedAt?: number; scores?: { trackKey: string; score: number }[] };

const DAY = 86_400_000;
/** An application with no answer after this long counts as ignored. */
export const SILENT_AFTER = 14 * DAY;

/** Null while there's nothing to learn yet: not applied, or applied too recently to call. */
export function outcomeOf(job: JobLike, now: number): Outcome | null {
  if (job.status === "screening" || job.status === "interview" || job.status === "offer") return "response";
  if (job.status === "rejected") return "rejected";
  if (job.status === "applied" && job.appliedAt && now - job.appliedAt > SILENT_AFTER) return "silent";
  return null;
}

export const BANDS = [
  { key: "high", label: "Scored 75+", min: 75 },
  { key: "mid", label: "Scored 60 to 74", min: 60 },
  { key: "low", label: "Scored under 60", min: 0 },
] as const;

export function bandOf(score: number) {
  return BANDS.find((b) => score >= b.min)!;
}

export type Tally = { total: number; responses: number };

/** Response rates per role and per score band, from every application with a known result. */
export function tallyOutcomes<J extends JobLike>(jobs: J[], trackOf: (j: J) => string | undefined, now: number) {
  const byTrack = new Map<string, Tally>();
  const byBand = new Map<string, Tally>();
  let total = 0;
  for (const j of jobs) {
    const o = outcomeOf(j, now);
    if (!o) continue;
    total++;
    const add = (m: Map<string, Tally>, key: string) => {
      const t = m.get(key) ?? { total: 0, responses: 0 };
      t.total++;
      if (o === "response") t.responses++;
      m.set(key, t);
    };
    const track = trackOf(j);
    if (track) add(byTrack, track);
    const score = track ? j.scores?.find((s) => s.trackKey === track)?.score : undefined;
    if (score !== undefined) add(byBand, bandOf(score).key);
  }
  return { total, byTrack, byBand };
}
