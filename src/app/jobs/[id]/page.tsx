"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { linkedInPeopleSearch } from "../../../../convex/lib/company";
import { CompanyMark, ScorePill, TrackTag, jobTrackKey, timeAgo } from "@/components/bits";
import { ApplyButton, CompanyResearch, CoverLetter, DirectNote, EmailDraft, HiringContacts, InterviewPrep, OutreachCard, PeoplePicker, StatusSelect, TailorButton } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton, CopyButton } from "@/components/ui";
import { inInr, useInrRates } from "@/lib/money";

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = id as Id<"jobs">;
  const me = useQuery(api.users.me);
  const data = useQuery(api.jobs.get, { jobId });
  const scoreJobs = useAction(api.agent.scoreJobs);
  const setStatus = useMutation(api.jobs.setStatus);
  const rates = useInrRates();
  // Set by "Add job" when the job saved but writing its CV didn't work.
  const cvError = useSearchParams().get("cvError");

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
  // Where this job is up to, so the page leads with the one thing to do now.
  const stage: Stage = !scores.length ? "score" : !job.pack ? "tailor" : job.status === "new" || job.status === "applying" ? "apply" : "reach";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/chat?job=${job._id}`} className="btn btn-ghost btn-sm float-right">
        Ask about this job
      </Link>
      <Link href="/jobs" className="text-sm text-ink-3 hover:text-ink">
        ← All jobs
      </Link>

      {cvError && (
        <p className="card mt-4 border-warn p-4 text-sm" role="status">
          The job is saved, but your CV wasn&apos;t written: {cvError} You can try again in step 1.
        </p>
      )}
      <header className="mt-4 mb-8 flex flex-wrap items-start gap-4">
        <CompanyMark job={job} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-3xl leading-tight md:text-4xl">{job.title}</h1>
          <p className="mt-1 text-ink-2">
            {job.company} · {job.location}
            {job.workSetting && job.workSetting !== "unknown" ? ` · ${job.workSetting}` : ""}
            {job.salary ? ` · ${job.salary}` : ""}
            {inInr(job.salary, rates) ? ` (${inInr(job.salary, rates)})` : ""}
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

      <NextStep stage={stage} job={job} resumes={me.resumes} defaultResumeId={currentTrack?.resumeId ?? me.defaultResumeId} scoreIt={async () => void (await scoreJobs({ jobIds: [job._id] }))} markApplied={async () => void (await setStatus({ jobId: job._id, status: "applied" }))} />

      <div className="space-y-3">
        <Fold title="Is it a fit?" status={scores.length ? `Best fit ${scores[0].score}` : "Not scored yet"} open={stage === "score"}>
          <div className="mb-4 flex justify-end">
            <ActionButton run={async () => void (await scoreJobs({ jobIds: [job._id] }))} pending="Scoring…" variant={scores.length ? "ghost" : "primary"} size="sm">
              {scores.length ? "Score again" : "Score this job"}
            </ActionButton>
          </div>
            {scores.length === 0 ? (
              <p className="text-sm text-ink-2">Score it to see how it reads for each of your roles, and why.</p>
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
        </Fold>

        <Fold n={1} title="Tailor your CV and cover letter" status={job.pack ? "Done" : "Not written yet"} open={stage === "tailor"}>
            <p className="-mt-2 mb-4 text-sm text-ink-2">One click writes the tailored CV, a cover letter, and a LinkedIn note and email for the hiring manager.</p>
            <TailorButton jobId={job._id} resumes={me.resumes} defaultResumeId={currentTrack?.resumeId ?? me.defaultResumeId} redo={!!job.pack} />
            {job.pack && (
              <div className="mt-5 space-y-4 border-t border-line pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/jobs/${job._id}/resume`} className="btn btn-primary">
                    Open tailored CV
                  </Link>
                  {job.pack.trackKey && trackByKey.get(job.pack.trackKey) && <span className="text-sm text-ink-2">Pitched as {trackByKey.get(job.pack.trackKey)?.name}</span>}
                </div>
                {job.pack.feedback && <p className="text-xs text-ink-3">Written with your changes: &quot;{job.pack.feedback}&quot;</p>}
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
        </Fold>

        <Fold n={2} title="Contact the hiring manager or HR" status={job.hiringContacts?.length ? `${job.hiringContacts.length} saved` : "Nobody saved yet"} open={false}>
            <p className="-mt-2 mb-3 text-sm text-ink-2">Find them on LinkedIn, save their details here, then message them in one click.</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {[...(job.pack?.hiringManagerTitles ?? []), "Talent Acquisition"].map((t) => (
                <a key={t} className="btn btn-ghost btn-sm" href={linkedInPeopleSearch(job.company, t)} target="_blank" rel="noreferrer">
                  Find {t} ↗
                </a>
              ))}
            </div>
            <HiringContacts owner={{ jobId: job._id }} contacts={job.hiringContacts ?? []} note={job.pack?.directNote} emailSubject={job.pack?.emailSubject} email={job.pack?.email} />
            {job.pack?.directNote ? (
              <div className="mt-5 space-y-5 border-t border-line pt-5">
                <div>
                  <div className="label mb-2">LinkedIn note</div>
                  <DirectNote key={job.pack.createdAt} jobId={job._id} text={job.pack.directNote} />
                </div>
                <div>
                  <div className="label mb-2">Email</div>
                  {job.pack.email ? (
                    <EmailDraft key={job.pack.createdAt} jobId={job._id} subject={job.pack.emailSubject ?? ""} body={job.pack.email} />
                  ) : (
                    <p className="text-sm text-ink-2">Press &quot;Write them again&quot; in step 1 to get an email version too.</p>
                  )}
                </div>
                <p className="text-xs text-ink-3">&quot;Hi &lt;first name&gt;&quot; is filled in with the person&apos;s name when you message them from their card above.</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-2">Write your CV in step 1 to get a LinkedIn note and an email for them.</p>
            )}
        </Fold>

        <Fold n={3} title="Ask your connections for a referral" status={job.outreach.length ? `${job.outreach.length} asked` : people.length ? `You know ${people.length} there` : "No connections there"} open={false}>
            {me.contactsCount === 0 ? (
              <p className="text-sm text-ink-2">
                Load your LinkedIn connections under People → <Link className="underline" href="/network">Your network</Link> to see who you know at {job.company}.
              </p>
            ) : people.length === 0 ? (
              <p className="text-sm text-ink-2">No first-degree connections at {job.company}. Try the hiring manager in step 2, or a second-degree intro.</p>
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
        </Fold>

        <Fold n={4} title="Apply" status={job.status === "new" || job.status === "applying" ? "Not applied yet" : `Applied${job.appliedAt ? ` ${timeAgo(job.appliedAt)}` : ""}`} open={stage === "apply"}>
            {me.answers.length > 0 ? (
              <div className="mb-4">
                <div className="label mb-2">Your answers, for the form</div>
                <div className="flex flex-wrap gap-2">
                  {me.answers.map((a) => (
                    <CopyButton key={a.question} text={a.answer} label={a.question} />
                  ))}
                </div>
              </div>
            ) : (
              <p className="mb-4 text-sm text-ink-2">
                Save your standard form answers (notice period, pay, why you&apos;re moving) on the <Link className="underline" href="/resume">CVs page</Link> to copy them here in one click.
              </p>
            )}
            <p className="mb-3 text-sm text-ink-2">
              Apply opens the form, downloads your tailored CV and copies your cover letter. Then click your Autofill bookmark (set it up on the{" "}
              <Link className="underline" href="/resume">CVs page</Link>), attach the CV, paste and submit.
            </p>
            <div className="flex flex-wrap items-start gap-3">
              <ApplyButton job={job} />
              {job.status === "new" || job.status === "applying" ? (
                <ActionButton run={async () => void (await setStatus({ jobId: job._id, status: "applied" }))}>I&apos;ve applied</ActionButton>
              ) : (
                <span className="text-sm text-ink-2">Applied{job.appliedAt ? ` ${timeAgo(job.appliedAt)}` : ""}. Move it along with the status menu at the top.</span>
              )}
            </div>
        </Fold>

        <details className="pt-4">
          <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">More: company research, interview prep, full job description</summary>
          <div className="mt-4 space-y-6">
            <CompanyResearch jobId={job._id} company={job.company} research={job.research} />
            <InterviewPrep jobId={job._id} prep={job.prep} />
            {job.description && (
              <div className="card p-6">
                <h2 className="display mb-4 text-2xl">Full job description</h2>
                <div className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{job.description}</div>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

type Stage = "score" | "tailor" | "apply" | "reach";

/** One part of the job, folded shut unless it's the step you're on. */
function Fold({ n, title, status, open, children }: { n?: number; title: string; status: string; open: boolean; children: React.ReactNode }) {
  return (
    <details className="card group" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5">
        {n !== undefined && <span className="display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft text-sm">{n}</span>}
        <span className="display flex-1 text-xl">{title}</span>
        <span className="text-xs text-ink-3">{status}</span>
        <span className="text-ink-3 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-5 pb-6">{children}</div>
    </details>
  );
}

/** The one thing to do now for this job, with its button. */
function NextStep({
  stage,
  job,
  resumes,
  defaultResumeId,
  scoreIt,
  markApplied,
}: {
  stage: Stage;
  job: Parameters<typeof ApplyButton>[0]["job"] & { _id: Id<"jobs">; pack?: unknown };
  resumes: { _id: Id<"resumes">; label: string }[];
  defaultResumeId: Id<"resumes"> | null | undefined;
  scoreIt: () => Promise<void>;
  markApplied: () => Promise<void>;
}) {
  const text = {
    score: ["See if it's worth your time", "A fit score for each of your roles, with the reasons and the gaps."],
    tailor: ["Write your tailored CV and cover letter", "Also writes a LinkedIn note and an email for the hiring manager."],
    apply: ["Apply", "Opens the form, downloads your tailored CV and copies your cover letter."],
    reach: ["Get noticed", "Applied. Now message the hiring manager (step 2) or ask someone you know for a referral (step 3)."],
  }[stage];
  return (
    <section className="card mb-6 border-accent p-6">
      <div className="label mb-1 text-accent">Next step</div>
      <h2 className="display text-2xl">{text[0]}</h2>
      <p className="mt-1 mb-4 text-sm text-ink-2">{text[1]}</p>
      {stage === "score" && (
        <ActionButton run={scoreIt} pending="Scoring…">
          Score this job
        </ActionButton>
      )}
      {stage === "tailor" && <TailorButton jobId={job._id} resumes={resumes} defaultResumeId={defaultResumeId ?? null} redo={false} />}
      {stage === "apply" && (
        <div className="flex flex-wrap items-start gap-3">
          <ApplyButton job={job} />
          <ActionButton run={markApplied} variant="ghost">
            I&apos;ve applied
          </ActionButton>
        </div>
      )}
    </section>
  );
}
