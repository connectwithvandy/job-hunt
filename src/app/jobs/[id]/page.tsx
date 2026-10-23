import Link from "next/link";
import { notFound } from "next/navigation";
import { scoreOne, setJobStatus, startApplication } from "@/app/actions";
import { CompanyMark, ScorePill, TrackTag, jobTrackId, timeAgo } from "@/components/bits";
import { CoverLetter, OutreachCard, PeoplePicker, StatusSelect } from "@/components/job-client";
import { ActionButton } from "@/components/ui";
import { contactsAt, linkedInPeopleSearch } from "@/lib/contacts";
import { getContacts, getJob, getResume, getTracks } from "@/lib/store";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const [job, tracks, contacts, resume] = await Promise.all([getJob(id), getTracks(), getContacts(), getResume()]);
  if (!job) notFound();

  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const scores = [...(job.scores ?? [])].sort((a, b) => b.score - a.score);
  const people = contactsAt(job.company, contacts);
  const askedIds = new Set(job.outreach.map((o) => o.contactId));
  const notAsked = people.filter((p) => !askedIds.has(p.id));
  const currentTrack = trackById.get(jobTrackId(job) ?? "");
  const cvName = `${resume?.name ?? "Your"} CV ${job.company}.pdf`;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/jobs" className="text-sm text-ink-3 hover:text-ink">
        ← All jobs
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-start gap-4">
        <CompanyMark job={job} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-3xl leading-tight md:text-4xl">{job.title}</h1>
          <p className="mt-1 text-ink-2">
            {job.company} · {job.location}
            {job.workSetting && job.workSetting !== "unknown" ? ` · ${job.workSetting}` : ""}
            {job.salary ? ` · ${job.salary}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <TrackTag track={currentTrack} />
            {job.postedAt && <span className="text-ink-3">Posted {timeAgo(job.postedAt)}</span>}
            {job.sourceUrl && (
              <a className="underline text-ink-2" href={job.sourceUrl} target="_blank" rel="noreferrer">
                Original posting
              </a>
            )}
            {job.source === "dreamwork" && (
              <a className="underline text-ink-2" href={job.url} target="_blank" rel="noreferrer">
                On Dreamwork
              </a>
            )}
          </div>
        </div>
        <StatusSelect jobId={job.id} status={job.status} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        {/* ---------- Left: is it a fit? ---------- */}
        <section className="space-y-6">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-2xl">Is it a fit?</h2>
              <ActionButton run={scoreOne.bind(null, job.id)} pending="Scoring…" variant={scores.length ? "ghost" : "primary"} size="sm">
                {scores.length ? "Score again" : "Score this job"}
              </ActionButton>
            </div>
            {scores.length === 0 ? (
              <p className="text-sm text-ink-2">Score it to see how it reads for each of your tracks, and why.</p>
            ) : (
              <ul className="space-y-4">
                {scores.map((s) => (
                  <li key={s.trackId} className="flex gap-3">
                    <ScorePill score={s.score} />
                    <div className="min-w-0">
                      <TrackTag track={trackById.get(s.trackId)} />
                      <p className="mt-1 text-sm">{s.reason}</p>
                      {s.gaps.length > 0 && <p className="mt-1 text-xs text-ink-3">Gaps: {s.gaps.join("; ")}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {job.brief && (
              <div className="mt-6 grid gap-4 border-t border-line pt-5 text-sm">
                <div>
                  <div className="label mb-1">What they really want</div>
                  <p>{job.brief.whatTheyWant}</p>
                </div>
                <div>
                  <div className="label mb-1">Watch outs</div>
                  <p>{job.brief.watchOuts}</p>
                </div>
              </div>
            )}
          </div>

          {job.description && (
            <details className="card p-6">
              <summary className="cursor-pointer font-medium">Full job description</summary>
              <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-2">{job.description}</div>
            </details>
          )}
        </section>

        {/* ---------- Right: apply ---------- */}
        <section className="space-y-6">
          <div className="card p-6">
            <Step n={1} title="Tailor your CV and cover letter" />
            {!resume ? (
              <p className="text-sm text-ink-2">
                Add your master CV first on the <Link className="underline" href="/resume">Master CV</Link> page.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(scores.length ? scores.map((s) => trackById.get(s.trackId)!) : tracks.filter((t) => t.status === "active"))
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((t, i) => (
                    <ActionButton key={t.id} run={startApplication.bind(null, job.id, t.id)} pending="Tailoring… about a minute" variant={i === 0 && !job.pack ? "primary" : "ghost"} size="sm">
                      {job.pack?.trackId === t.id ? `Redo as ${t.name}` : `Apply as ${t.name}`}
                    </ActionButton>
                  ))}
              </div>
            )}
            {job.pack && (
              <div className="mt-5 space-y-4 border-t border-line pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/jobs/${job.id}/resume`} className="btn btn-primary">
                    Open tailored CV
                  </Link>
                  <span className="text-sm text-ink-2">Pitched as {trackById.get(job.pack.trackId)?.name}</span>
                </div>
                {job.pack.unverified.length > 0 ? (
                  <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">
                    Check these numbers before sending, they aren&apos;t in your master CV: {job.pack.unverified.join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-good">Fact check passed: every number matches your master CV.</p>
                )}
                <div>
                  <div className="label mb-2">Cover letter</div>
                  <CoverLetter jobId={job.id} text={job.pack.coverLetter} />
                </div>
              </div>
            )}
          </div>

          <div className="card p-6">
            <Step n={2} title="Ask for a referral" />
            {contacts.length === 0 ? (
              <p className="text-sm text-ink-2">
                Load your LinkedIn connections on the <Link className="underline" href="/network">Network</Link> page to see who you know at {job.company}.
              </p>
            ) : people.length === 0 ? (
              <p className="text-sm text-ink-2">No first-degree connections at {job.company}. Try the hiring manager below, or a second-degree intro.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-2">
                  You know {people.length} {people.length === 1 ? "person" : "people"} at {job.company}. Asking one or two works better than asking everyone.
                </p>
                {notAsked.length > 0 && <PeoplePicker jobId={job.id} people={notAsked} best={Math.min(2, notAsked.length)} />}
              </>
            )}
            {job.outreach.length > 0 && (
              <div className="mt-5 space-y-3">
                {job.outreach.map((o) => (
                  <OutreachCard key={o.contactId} jobId={job.id} o={o} cvName={cvName} />
                ))}
              </div>
            )}
            {job.pack && job.pack.hiringManagerTitles.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="label mb-2">Find the hiring manager</div>
                <div className="flex flex-wrap gap-2">
                  {job.pack.hiringManagerTitles.map((t) => (
                    <a key={t} className="btn btn-ghost btn-sm" href={linkedInPeopleSearch(job.company, t)} target="_blank" rel="noreferrer">
                      {t} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card p-6">
            <Step n={3} title="Apply" />
            <div className="flex flex-wrap items-center gap-3">
              {job.sourceUrl && (
                <a className="btn btn-ghost" href={job.sourceUrl} target="_blank" rel="noreferrer">
                  Open the application ↗
                </a>
              )}
              {job.status === "new" || job.status === "applying" ? (
                <ActionButton run={setJobStatus.bind(null, job.id, "applied")}>I&apos;ve applied</ActionButton>
              ) : (
                <span className="text-sm text-ink-2">
                  Applied{job.appliedAt ? ` ${timeAgo(job.appliedAt)}` : ""}. Move it along with the status menu at the top.
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="display flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm text-on-accent">{n}</span>
      <h2 className="display text-2xl">{title}</h2>
    </div>
  );
}
