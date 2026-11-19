import { companySite, faviconOf } from "../lib/logo";
import type { Doc } from "../../convex/_generated/dataModel";
import { trackForTitle } from "../../convex/lib/salesRoles";

type Track = Doc<"tracks">;
type JobLike = Pick<Doc<"jobs">, "company" | "companyLogo" | "scores" | "trackKey" | "foundFor" | "title">;

export function TrackTag({ track }: { track?: Track }) {
  if (!track) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2 whitespace-nowrap">
      <span className="h-2 w-2 rounded-full" style={{ background: track.color }} />
      {track.name}
    </span>
  );
}

export function scoreTone(score: number) {
  // 75 is a strong fit everywhere: Today, the Jobs filter and this badge.
  if (score >= 75) return "bg-accent text-on-accent";
  if (score >= 60) return "bg-violet/15 text-violet";
  return "bg-soft text-ink-3";
}

export function ScorePill({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-xs text-ink-3">Not scored</span>;
  return (
    <span className={`inline-flex h-fit min-w-9 shrink-0 justify-center self-start rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(score)}`}>
      {score}
    </span>
  );
}

/**
 * The free quick fit on the AI score's scale. Raw first guesses ran about 37 points above the AI score for the
 * same job (414 jobs, 1 Nov 2026: a guess of 100 averaged 56, guesses in the 80s averaged 37), so the number
 * shown is scaled to match. Ranking still uses the raw guess.
 */
export const likelyScore = (quickFit: number) => Math.round(15 + quickFit * 0.4);

/** The free quick fit, shown faded with a "~" until the AI score replaces it. */
export function QuickFitPill({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-xs text-ink-3">Not scored</span>;
  return (
    <span title="First guess from title, CV words and place, on the AI score's scale. The AI score replaces it." className="inline-flex h-fit min-w-9 shrink-0 justify-center self-start rounded-full border border-line px-2 py-0.5 text-xs tabular-nums text-ink-3">
      ~{likelyScore(score)}
    </span>
  );
}

/**
 * One fit number on every job, as a ring with a % like Dreamwork (19 Nov), instead of a score pill on some
 * jobs and "~52 guess" on others. The AI score fills the ring solidly; a first guess (not scored yet) shows
 * with a dashed ring and "~", and says so on hover, so it never passes for a real score.
 */
export function FitBadge({ job, size = 40 }: { job: Pick<JobLike, "scores"> & { quickFit?: number }; size?: number }) {
  const best = bestScore(job);
  const guess = !best;
  const value = best ? best.score : job.quickFit !== undefined ? likelyScore(job.quickFit) : undefined;
  if (value === undefined) return <span className="text-xs text-ink-3">Not scored</span>;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const tone = guess ? "var(--ink-3)" : value >= 75 ? "#65a30d" : value >= 60 ? "var(--violet)" : "var(--ink-3)";
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      title={guess ? "First guess from the title, your CV's words and the place. Open the job and check the fit for the real score." : `Fit ${value}%, scored by the AI on the whole job`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeDasharray={guess ? "3 3" : `${(c * value) / 100} ${c}`} />
      </svg>
      <span className={`absolute text-[11px] font-semibold tabular-nums ${guess ? "text-ink-3" : ""}`}>
        {guess ? "~" : ""}
        {value}
        <span className="text-[8px]">%</span>
      </span>
    </span>
  );
}

export function bestScore(job: Pick<JobLike, "scores">) {
  if (!job.scores?.length) return undefined;
  return [...job.scores].sort((a, b) => b.score - a.score)[0];
}

/**
 * The track a job belongs to: the one you applied with, else the track its title fits best, else the best score,
 * else the search that found it. The title comes before the score: a CV can score a little higher on "Sales
 * Leadership" for an SDR Manager job, which put jobs in the wrong group.
 */
export function jobTrackKey(job: JobLike, tracks?: { key: string; titles: string[] }[]) {
  return job.trackKey ?? (tracks && trackForTitle(tracks, job.title)) ?? bestScore(job)?.trackKey ?? job.foundFor;
}

export function CompanyMark({ job, size = 36 }: { job: Pick<JobLike, "company" | "companyLogo"> & { url?: string; sourceUrl?: string }; size?: number }) {
  // Clearbit's free logo service shut down; Google's favicon service still works for any domain.
  const domain = job.companyLogo?.match(/logo\.clearbit\.com\/([^/?]+)/)?.[1];
  const site = !job.companyLogo ? companySite(job.company, job.sourceUrl || job.url) : null;
  const logo = domain ? faviconOf(domain) : (job.companyLogo ?? (site ? faviconOf(site) : undefined));
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} className="rounded-lg border border-line bg-white object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="display inline-flex shrink-0 items-center justify-center rounded-lg border border-line bg-soft text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {job.company.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The hour a new day starts. Late nights still count toward the day before, so work done at 1 AM isn't wiped. */
export const DAY_STARTS_AT = 4;

/** When the day containing `t` started: 4 AM local, or 4 AM the day before if it's still the small hours. */
export function dayStart(t: number) {
  const d = new Date(t);
  if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
  return d.setHours(DAY_STARTS_AT, 0, 0, 0);
}

export function timeAgo(when?: string | number) {
  if (!when) return "";
  // Days that start at 4 AM, so "today" means the same as the Today counters.
  const days = Math.round((dayStart(Date.now()) - dayStart(new Date(when).getTime())) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-4xl md:text-5xl">{title}</h1>
        {sub && <p className="mt-2 text-ink-2 max-w-xl">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
