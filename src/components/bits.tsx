import type { Job, Track } from "@/lib/types";

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
  if (score >= 80) return "bg-accent text-on-accent";
  if (score >= 60) return "bg-warn/15 text-warn";
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

export function bestScore(job: Job) {
  if (!job.scores?.length) return undefined;
  return [...job.scores].sort((a, b) => b.score - a.score)[0];
}

/** The track a job belongs to: the one you applied with, else the best score, else the search that found it. */
export function jobTrackId(job: Job) {
  return job.trackId ?? bestScore(job)?.trackId ?? job.foundFor;
}

export function CompanyMark({ job, size = 36 }: { job: Job; size?: number }) {
  // Clearbit's free logo service shut down; Google's favicon service still works for any domain.
  const domain = job.companyLogo?.match(/logo\.clearbit\.com\/([^/?]+)/)?.[1];
  const logo = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : job.companyLogo;
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

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
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
