import Link from "next/link";
import { scoreBatch } from "@/app/actions";
import { CompanyMark, PageHead, ScorePill, TrackTag, bestScore, jobTrackId, timeAgo } from "@/components/bits";
import { AddJob, FindJobs } from "@/components/job-client";
import { ActionButton } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/defaults";
import { getJobs, getTracks } from "@/lib/store";

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const { track, show } = await searchParams;
  const [jobs, tracks] = await Promise.all([getJobs(), getTracks()]);
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  const visible = jobs
    .filter((j) => (show === "hidden" ? j.status === "dismissed" : j.status !== "dismissed"))
    .filter((j) => !track || jobTrackId(j) === track)
    .sort((a, b) => (bestScore(b)?.score ?? -1) - (bestScore(a)?.score ?? -1) || b.addedAt.localeCompare(a.addedAt));
  const unscored = visible.filter((j) => !j.scores?.length).map((j) => j.id);

  const chip = (href: string, label: React.ReactNode, active: boolean) => (
    <Link key={href} href={href} className={`rounded-full border px-3 py-1 text-sm ${active ? "border-accent bg-accent text-on-accent font-medium" : "border-line bg-card text-ink-2 hover:text-ink"}`}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead title="Jobs" sub="Every role you're considering, sorted by how well it fits your best track." />

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <FindJobs tracks={tracks} />
        <AddJob />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip("/jobs", "All tracks", !track && show !== "hidden")}
        {tracks.map((t) => chip(`/jobs?track=${t.id}`, <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: t.color }} />{t.name}</span>, track === t.id))}
        {chip("/jobs?show=hidden", "Not for me", show === "hidden")}
        <span className="flex-1" />
        {unscored.length > 0 && (
          <ActionButton run={scoreBatch.bind(null, unscored.slice(0, 12))} pending={`Scoring ${Math.min(12, unscored.length)} jobs…`} variant="ghost" size="sm">
            Score {Math.min(12, unscored.length)} unscored {unscored.length > 12 ? `of ${unscored.length}` : ""}
          </ActionButton>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-ink-2">
          No jobs here yet. Search Dreamwork above, or paste a link to a job you saw.
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {visible.map((j) => {
            const best = bestScore(j);
            return (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-soft">
                  <CompanyMark job={j} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{j.title}</span>
                      <span className="text-sm text-ink-2">{j.company}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {j.location}
                      {j.postedAt ? ` · ${timeAgo(j.postedAt)}` : ""}
                      {j.status !== "new" ? ` · ${STATUS_LABELS[j.status]}` : ""}
                    </div>
                    {best && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{best.reason}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <ScorePill score={best?.score} />
                    <TrackTag track={trackById.get(jobTrackId(j) ?? "")} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
