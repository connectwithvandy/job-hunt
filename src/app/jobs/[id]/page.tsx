"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { linkedInPeopleSearch } from "../../../../convex/lib/company";
import { CompanyMark, ScorePill, TrackTag, jobTrackKey, timeAgo } from "@/components/bits";
import { CoverLetter, DirectNote, OutreachCard, PeoplePicker, StatusSelect } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton } from "@/components/ui";

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = id as Id<"jobs">;
  const me = useQuery(api.users.me);
  const data = useQuery(api.jobs.get, { jobId });
  const scoreJobs = useAction(api.agent.scoreJobs);
  const tailor = useAction(api.agent.tailor);
  const setStatus = useMutation(api.jobs.setStatus);

  if (!me || data === undefined) return <Loading />;
  if (data === null) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-ink-2">
        This job isn&apos;t in your list. <Link className="underline" href="/jobs">Back to jobs</Link>
      </div>
    );
  }
  const { job, people } = data;
  const trackByKey = new Map(me.tracks.map((t) => [t.key, t]));
  const scores = [...(job.scores ?? [])].sort((a, b) => b.score - a.score);
  const askedIds = new Set(job.outreach.map((o) => o.contactId));
  const notAsked = people.filter((p) => !askedIds.has(p._id));
  const currentTrack = trackByKey.get(jobTrackKey(job) ?? "");
  // No CV attachment for an internal move: colleagues already know you.
  const cvName = currentTrack?.company ? "" : `${me.resume?.name ?? "Your"} CV ${job.company}.pdf`;
  const applyTracks = (scores.length ? scores.map((s) => trackByKey.get(s.trackKey)) : me.tracks.filter((t) => t.status === "active"))
    .filter((t) => !!t)
    .slice(0, 4);

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
              <a className="text-ink-2 underline" href={job.sourceUrl} target="_blank" rel="noreferrer">
                Original posting
              </a>
            )}
            {job.source === "dreamwork" && (
              <a className="text-ink-2 underline" href={job.url} target="_blank" rel="noreferrer">
                On Dreamwork
              </a>
            )}
          </div>
        </div>
        <StatusSelect jobId={job._id} status={job.status} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section className="space-y-6">
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-2xl">Is it a fit?</h2>
              <ActionButton run={async () => void (await scoreJobs({ jobIds: [job._id] }))} pending="Scoring…" variant={scores.length ? "ghost" : "primary"} size="sm">
                {scores.length ? "Score again" : "Score this job"}
              </ActionButton>
            </div>
            {scores.length === 0 ? (
              <p className="text-sm text-ink-2">Score it to see how it reads for each of your tracks, and why.</p>
            ) : (
              <ul className="space-y-4">
                {scores.map((s) => (
                  <li key={s.trackKey} className="flex gap-3">
                    <ScorePill score={s.score} />
                    <div className="min-w-0">
                      <TrackTag track={trackByKey.get(s.trackKey)} />
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

        <section className="space-y-6">
          <div className="card p-6">
            <Step n={1} title="Tailor your CV and cover letter" />
            <p className="-mt-2 mb-4 text-sm text-ink-2">One click writes the tailored CV, a cover letter and a short note for the hiring manager.</p>
            <div className="flex flex-wrap gap-2">
              {applyTracks.map((t, i) => (
                <ActionButton key={t!.key} run={async () => void (await tailor({ jobId: job._id, trackKey: t!.key }))} pending="Tailoring… about a minute" variant={i === 0 && !job.pack ? "primary" : "ghost"} size="sm">
                  {job.pack?.trackKey === t!.key ? `Redo as ${t!.name}` : `Apply as ${t!.name}`}
                </ActionButton>
              ))}
            </div>
            {job.pack && (
              <div className="mt-5 space-y-4 border-t border-line pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/jobs/${job._id}/resume`} className="btn btn-primary">
                    Open tailored CV
                  </Link>
                  <span className="text-sm text-ink-2">Pitched as {trackByKey.get(job.pack.trackKey)?.name}</span>
                </div>
                {job.pack.unverified.length > 0 ? (
                  <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">Check these numbers before sending, they aren&apos;t in your master CV: {job.pack.unverified.join(", ")}</p>
                ) : (
                  <p className="text-xs text-good">Fact check passed: every number matches your master CV.</p>
                )}
                <div>
                  <div className="label mb-2">Cover letter</div>
                  <CoverLetter key={job.pack.createdAt} jobId={job._id} text={job.pack.coverLetter} />
                </div>
              </div>
            )}
          </div>

          {job.pack?.directNote && (
            <div className="card p-6">
              <Step n={2} title="Message the hiring manager or HR" />
              <p className="mb-3 text-sm text-ink-2">Find them with a search below, swap in their first name, and send it on LinkedIn or by email.</p>
              <DirectNote key={job.pack.createdAt} text={job.pack.directNote} />
              <div className="mt-4 flex flex-wrap gap-2">
                {[...job.pack.hiringManagerTitles, "Talent Acquisition"].map((t) => (
                  <a key={t} className="btn btn-ghost btn-sm" href={linkedInPeopleSearch(job.company, t)} target="_blank" rel="noreferrer">
                    {t} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="card p-6">
            <Step n={job.pack?.directNote ? 3 : 2} title="Ask your connections for a referral" />
            {me.contactsCount === 0 ? (
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
                {notAsked.length > 0 && <PeoplePicker jobId={job._id} people={notAsked} best={Math.min(2, notAsked.length)} />}
              </>
            )}
            {job.outreach.length > 0 && (
              <div className="mt-5 space-y-3">
                {job.outreach.map((o) => (
                  <OutreachCard key={o.contactId + o.message.length} jobId={job._id} o={o} cvName={cvName} />
                ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <Step n={job.pack?.directNote ? 4 : 3} title="Apply" />
            <div className="flex flex-wrap items-center gap-3">
              {job.sourceUrl && (
                <a className="btn btn-ghost" href={job.sourceUrl} target="_blank" rel="noreferrer">
                  Open the application ↗
                </a>
              )}
              {job.status === "new" || job.status === "applying" ? (
                <ActionButton run={async () => void (await setStatus({ jobId: job._id, status: "applied" }))}>I&apos;ve applied</ActionButton>
              ) : (
                <span className="text-sm text-ink-2">Applied{job.appliedAt ? ` ${timeAgo(job.appliedAt)}` : ""}. Move it along with the status menu at the top.</span>
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
