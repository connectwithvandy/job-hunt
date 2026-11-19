"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSetStatus } from "@/components/Celebrate";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { linkedInPeopleSearch, applyBoard } from "../../../../convex/lib/company";
import { RECHECK_AFTER, ghostSigns, shortPlace, skipReason } from "../../../../convex/lib/posting";
import { CompanyMark, ScorePill, TrackTag, jobTrackKey, timeAgo } from "@/components/bits";
import { CvMatch } from "@/components/CvMatch";
import { ApplyButton, ApplyQuestions, CompanyResearch, CoverLetter, DirectNote, EmailDraft, FavoriteStar, CallScript, HiringContacts, InterviewPrep, JobEmails, needsAnswer, OutreachCard, PeoplePicker, StatusSelect, TailorButton } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton, CopyButton } from "@/components/ui";
import { inInr, payRange, payText, useInrRates } from "@/lib/money";
import { payEstimateText } from "../../../../convex/lib/payEstimate";

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = id as Id<"jobs">;
  const me = useQuery(api.users.me);
  const data = useQuery(api.jobs.get, { jobId });
  const gmail = useQuery(api.google.status);
  const scoreJobs = useAction(api.agent.scoreJobs);
  const setStatus = useSetStatus();
  const checkPosting = useAction(api.agent.checkPosting);
  const rates = useInrRates();
  const [now] = useState(() => Date.now());
  // A job you might still apply to gets its posting looked at again once a day. It's free: no AI.
  const live = data?.job.liveCheck;
  const active = data?.job.status === "new" || data?.job.status === "applying";
  const stale = !!data && active && (!live || now - live.at > RECHECK_AFTER);
  useEffect(() => {
    if (stale) void checkPosting({ jobId }).catch(() => {});
  }, [stale, jobId, checkPosting]);
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
  const askedIds = new Set([...job.outreach.map((o) => o.contactId), ...(job.skipped ?? [])]);
  const notAsked = people.filter((p) => !askedIds.has(p._id));
  const currentTrack = trackByKey.get(jobTrackKey(job, me.tracks) ?? "");
  // No CV attachment for an internal move: colleagues already know you.
  const cvName = currentTrack?.company ? "" : `${me.resume?.name ?? "Your"} CV ${job.company}.pdf`;
  // Where this job is up to, so the page leads with the one thing to do now.
  const stage: Stage =
    (job.status as string) === "screening" || job.status === "interview" || job.status === "offer"
      ? "interview"
      : job.status === "rejected" || job.status === "dismissed"
        ? "done"
        : !scores.length ? "score" : !job.pack ? "tailor" : job.status === "new" || job.status === "applying" ? "apply" : "reach";
  // Once a CV is written the choice is made, so the skip warning goes.
  const skip = job.pack ? null : skipReason(job);
  const ghost = ghostSigns(job, data.sighting, now);
  const referralFirst = people.length > 0;

  const hiringStep = (
    <section key="hiring">
      <h3 className="mb-3 font-medium">Contact the hiring manager or HR</h3>
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
                <p className="text-sm text-ink-2">Press &quot;Write them again&quot; on the CV &amp; letter tab to get an email version too.</p>
              )}
            </div>
            <p className="text-xs text-ink-3">&quot;Hi &lt;first name&gt;&quot; is filled in with the person&apos;s name when you message them from their card above.</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-2">Write your CV on the CV &amp; letter tab to get a LinkedIn note and an email for them.</p>
        )}
    </section>
  );
  const referralStep = (
    <section key="referral">
      <h3 className="mb-3 font-medium">Ask your connections for a referral</h3>
        {me.contactsCount === 0 ? (
          <p className="text-sm text-ink-2">
            Load your LinkedIn connections under Profile → <Link className="underline" href="/connect">LinkedIn &amp; Gmail</Link> to see who you know at {job.company}.
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
    </section>
  );

  // An email waiting for your answer goes to the top, above the steps.
  const answerFirst = data.emails.some(needsAnswer);
  const account = gmail?.email || me.email;
  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/chat?job=${job._id}`} className="btn btn-ghost btn-sm float-right">
        Ask about this job
      </Link>
      <Link href="/jobs" className="text-sm text-ink-3 hover:text-ink">
        ← All jobs
      </Link>

      {cvError && (
        <p className="card mt-4 border-warn p-4 text-sm" role="status">
          The job is saved, but your CV wasn&apos;t written: {cvError} You can try again on the CV &amp; letter tab.
        </p>
      )}
      <header className="mt-4 mb-8 flex flex-wrap items-start gap-4">
        <CompanyMark job={job} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">{job.title}</h1>
            <FavoriteStar jobId={job._id} favorite={!!job.favorite} className="mt-1.5 text-2xl" />
          </div>
          <p className="mt-1 text-ink-2">
            {job.company} · {shortPlace(job.location)}
            {job.workSetting && job.workSetting !== "unknown" ? ` · ${job.workSetting}` : ""}
            {payText(job.salary, rates) ? ` · ${inInr(job.salary, rates) ? job.salary : payText(job.salary, rates)}` : ""}
            {payText(job.salary, rates) && inInr(job.salary, rates) ? ` (${inInr(job.salary, rates)})` : ""}
            {!payText(job.salary, rates) && payEstimateText(job) ? ` · ${payEstimateText(job)} (estimate)` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <TrackTag track={currentTrack} />
            {currentTrack?.pay && <span className="text-ink-2">Ask for {payRange(currentTrack.pay)}</span>}
            {job.postedAt && <span className="text-ink-3">Posted {timeAgo(job.postedAt)}</span>}
            {(job.sourceUrl || job.url) && (
              <a className="text-ink-2 underline" href={job.sourceUrl || job.url} target="_blank" rel="noreferrer">
                {applyBoard(job.sourceUrl || job.url) ? `Posting on ${applyBoard(job.sourceUrl || job.url)}` : "Original posting"}
              </a>
            )}
          </div>
        </div>
        <StatusSelect jobId={job._id} status={job.status} />
      </header>

      <PostingCheck live={job.liveCheck} checking={stale} ghost={ghost} check={async () => void (await checkPosting({ jobId: job._id }))} />

      {answerFirst && <JobEmails emails={data.emails} company={job.company} account={account} />}

      <NextStep stage={stage} skip={skip} knows={people.length} company={job.company} dismiss={async () => void (await setStatus({ jobId: job._id, status: "dismissed" }))} job={job} resumes={me.resumes} defaultResumeId={currentTrack?.resumeId ?? me.defaultResumeId} scoreIt={async () => void (await scoreJobs({ jobIds: [job._id] }))} markApplied={async () => void (await setStatus({ jobId: job._id, status: "applied" }))} />

      <JobTabs
        initial={stage === "score" ? "fit" : stage === "tailor" ? "cv" : stage === "apply" ? "apply" : stage === "reach" ? "people" : stage === "interview" ? "prepare" : "fit"}
        tabs={[
          {
            key: "fit",
            label: "Fit",
            badge: scores.length ? String(scores[0].score) : undefined,
            content: (
              <>
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
                {job.brief.blocker && (
                  <div>
                    <div className="label mb-1 text-bad">Rules you out</div>
                    <p>{job.brief.blocker}</p>
                  </div>
                )}
              </div>
            )}
              </>
            ),
          },
          {
            key: "cv",
            label: "CV & letter",
            badge: job.pack ? "Ready" : undefined,
            content: (
              <>
            {/* Before the first draft the Next step box above holds the button, so it isn't shown twice. */}
            {stage === "tailor" ? (
              <p className="-mt-2 mb-4 text-sm text-ink-2">Use the button in the box above to write the tailored CV, cover letter, LinkedIn note and email.</p>
            ) : (
              <>
            <p className="-mt-2 mb-4 text-sm text-ink-2">One click writes the tailored CV, a cover letter, and a LinkedIn note and email for the hiring manager.</p>
            {skip && <p className="mb-3 rounded-lg bg-warn/10 p-3 text-sm text-warn">{skip}</p>}
            <TailorButton jobId={job._id} resumes={me.resumes} defaultResumeId={currentTrack?.resumeId ?? me.defaultResumeId} redo={!!job.pack} anyway={!!skip} favorite={!!job.favorite} />
              </>
            )}
            <CvMatch description={job.description} company={job.company} tailored={job.pack?.resume} resumeId={currentTrack?.resumeId ?? me.defaultResumeId} />
            {job.pack && (
              <div className="mt-5 space-y-4 border-t border-line pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/jobs/${job._id}/resume`} className="btn btn-primary">
                    Open tailored CV
                  </Link>
                  {job.pack.trackKey && trackByKey.get(job.pack.trackKey) && <span className="text-sm text-ink-2">Pitched as {trackByKey.get(job.pack.trackKey)?.name}</span>}
                </div>
                {job.sent && (
                  <p className="text-sm text-ink-2">
                    What you sent on {new Date(job.sent.at).toLocaleDateString()}, kept for the interview:{" "}
                    <Link className="underline" href={`/jobs/${job._id}/resume?sent=1`}>CV</Link> ·{" "}
                    <Link className="underline" href={`/jobs/${job._id}/letter?sent=1`}>cover letter</Link>
                  </p>
                )}
                {job.pack.letterOnly && <p className="text-xs text-ink-3">Only the cover letter was written for this job. Your CV is your master CV as it is.</p>}
                {job.pack.feedback && <p className="text-xs text-ink-3">Written with your changes: &quot;{job.pack.feedback}&quot;</p>}
                {!!job.pack.fit?.length && (
                  <div>
                    <div className="label mb-2">What they ask for, and where your CV proves it</div>
                    <ul className="card divide-y divide-line text-sm">
                      {job.pack.fit.map((f) => (
                        <li key={f.ask} className="grid gap-1 p-3 sm:grid-cols-[1fr_2fr] sm:gap-4">
                          <span className="font-medium">{f.ask}</span>
                          {f.proof ? <span className="text-ink-2">{f.proof}</span> : <span className="text-warn">Nothing in your CV shows this. Cover it in the cover letter or the interview, or add it to your CV if it&apos;s true.</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {job.pack.unverified.length > 0 ? (
                  <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">Check these numbers before sending, they aren&apos;t in your master CV: {job.pack.unverified.join(", ")}</p>
                ) : (
                  <p className="text-xs text-good">Fact check passed: every number matches your master CV.</p>
                )}
                <div>
                  <div className="label mb-2">Cover letter</div>
                  <CoverLetter key={job.pack.createdAt} jobId={job._id} text={job.pack.coverLetter} resume={job.pack.resume} company={job.company} />
                </div>
              </div>
            )}
              </>
            ),
          },
          {
            key: "people",
            label: "People",
            badge: people.length ? String(people.length) : undefined,
            content: <div className="space-y-8">{referralFirst ? [referralStep, hiringStep] : [hiringStep, referralStep]}</div>,
          },
          {
            key: "apply",
            label: "Apply",
            badge: job.status === "new" || job.status === "applying" ? undefined : "Done",
            content: (
              <>
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
            <ApplyQuestions jobId={job._id} form={job.applyForm} />
            <p className="mb-3 text-sm text-ink-2">
              Apply opens the form and downloads your tailored CV. Then click your JobPipe autofill bookmark (set it up on the{" "}
              <Link className="underline" href="/resume">CVs page</Link>): it fills your answers and attaches the CV. Check everything and press Submit yourself.
            </p>
            <div className="flex flex-wrap items-start gap-3">
              <ApplyButton job={job} />
              {job.status === "new" || job.status === "applying" ? (
                <ActionButton run={async () => void (await setStatus({ jobId: job._id, status: "applied" }))}>I&apos;ve applied</ActionButton>
              ) : (
                <span className="text-sm text-ink-2">Applied{job.appliedAt ? ` ${timeAgo(job.appliedAt)}` : ""}. Move it along with the status menu at the top.</span>
              )}
            </div>
              </>
            ),
          },
          {
            key: "prepare",
            label: "Prepare",
            badge: data.interviews.length ? String(data.interviews.length) : undefined,
            content: (
              <div className="space-y-6">
                {data.interviews.length > 0 && (
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-semibold">Interviews</h2>
            <ul className="divide-y divide-line text-sm">
              {data.interviews.map((i) => (
                <li key={i._id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span className="font-medium">{i.title}</span>
                  <span className="flex items-center gap-3 text-ink-2">
                    {new Date(i.start).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    {i.link.startsWith("https://") && (
                      <a className="underline" href={i.link} target="_blank" rel="noreferrer">
                        Join
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}


          <CompanyResearch jobId={job._id} company={job.company} research={job.research} />
          <InterviewPrep jobId={job._id} prep={job.prep} answers={job.interviewAnswers} />
          <CallScript jobId={job._id} script={job.callScript} />
              </div>
            ),
          },
          ...(data.emails.length > 0 && !answerFirst
            ? [{ key: "emails", label: "Emails", badge: String(data.emails.length), content: <JobEmails emails={data.emails} company={job.company} account={account} /> }]
            : []),
          ...(job.description
            ? [{ key: "job", label: "Job description", content: <div className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{job.description}</div> }]
            : []),
        ]}
      />
    </div>
  );
}

/**
 * The job's parts as tabs in one panel, like Dreamwork's application view (19 Nov), instead of a long page of
 * numbered steps. It opens on the tab for where the job is up to; the hash (#prep, #emails) still jumps there.
 */
function JobTabs({ tabs, initial }: { tabs: { key: string; label: string; badge?: string; content: React.ReactNode }[]; initial: string }) {
  const [on, setOn] = useState(() => {
    try {
      const hash = window.location.hash.slice(1);
      const fromHash = hash === "prep" ? "prepare" : hash;
      if (tabs.some((t) => t.key === fromHash)) return fromHash;
    } catch {}
    return initial;
  });
  const current = tabs.find((t) => t.key === on) ?? tabs[0];
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2 text-sm" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === current.key}
            onClick={() => setOn(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap ${t.key === current.key ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {t.label}
            {t.badge && <span className="rounded-full bg-soft px-1.5 text-[11px] text-ink-2">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="p-5 md:p-6" role="tabpanel">
        {current.content}
      </div>
    </div>
  );
}

type Stage = "score" | "tailor" | "apply" | "reach" | "interview" | "done";

/** Whether the posting is still up, and any signs it isn't a real opening. */
function PostingCheck({
  live,
  checking,
  ghost,
  check,
}: {
  live?: { at: number; state: "open" | "closed" | "unknown"; note: string };
  checking: boolean;
  ghost: ReturnType<typeof ghostSigns>;
  check: () => Promise<void>;
}) {
  const tone = live?.state === "closed" ? "text-bad" : live?.state === "open" ? "text-good" : "text-ink-3";
  const word = checking && !live ? "Checking the posting is still up…" : !live ? "Not checked yet." : { open: "Still open.", closed: "Looks closed.", unknown: "Couldn't check." }[live.state];
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className={`font-medium ${tone}`}>{word}</span>
        {live && <span className="text-ink-2">{live.note}</span>}
        {live && <span className="text-xs text-ink-3">Checked {timeAgo(live.at)}</span>}
        <ActionButton run={check} pending="Checking…" variant="ghost" size="sm">
          Check again
        </ActionButton>
      </div>
      {ghost.level !== "none" && (
        <div className={`card p-4 text-sm ${ghost.level === "likely" ? "border-warn" : ""}`}>
          <div className={`font-medium ${ghost.level === "likely" ? "text-warn" : ""}`}>{ghost.level === "likely" ? "This may not be a real opening" : "One thing to know"}</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
            {ghost.signs.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-3">Signs, not proof. A referral or a note to the hiring manager is the quickest way to find out if they&apos;re really hiring.</p>
        </div>
      )}
    </div>
  );
}

/** The one thing to do now for this job, with its button. */
function NextStep({
  stage,
  knows,
  company,
  skip,
  dismiss,
  job,
  resumes,
  defaultResumeId,
  scoreIt,
  markApplied,
}: {
  stage: Stage;
  /** How many of your connections work there. */
  knows: number;
  company: string;
  /** Why the app says not to apply, when it does. */
  skip: string | null;
  dismiss: () => Promise<void>;
  job: Parameters<typeof ApplyButton>[0]["job"] & { _id: Id<"jobs">; pack?: unknown; favorite?: boolean };
  resumes: { _id: Id<"resumes">; label: string }[];
  defaultResumeId: Id<"resumes"> | null | undefined;
  scoreIt: () => Promise<void>;
  markApplied: () => Promise<void>;
}) {
  const text = {
    score: ["See if it's worth your time", "A fit score for each of your roles, with the reasons and the gaps."],
    tailor: ["Write your tailored CV and cover letter", "Also writes a LinkedIn note and an email for the hiring manager."],
    apply: ["Apply", "Opens the form, downloads your tailored CV and copies your cover letter."],
    reach: knows
      ? ["Ask for a referral", `Applied. You know ${knows} ${knows === 1 ? "person" : "people"} at ${company}: a referral is the strongest way in (People tab). Then message the hiring manager.`]
      : ["Get noticed", "Applied. Now message the hiring manager (People tab), and follow up in a week if they don't reply."],
    interview: [
      job.status === "offer" ? "Weigh the offer" : "Prepare for the interview",
      job.status === "offer"
        ? "Check the pay against what you'd ask for, and ask Ask JobPipe to help you negotiate."
        : "Open the interview prep under More at the bottom: likely questions, your proof of work that answers them, and research on the company.",
    ],
    done: null,
  }[stage];
  if (!text) return null;
  if (skip && stage === "tailor") {
    return (
      <section className="card mb-6 border-warn p-6">
        <div className="label mb-1 text-warn">Next step</div>
        <h2 className="text-lg font-semibold">Skip this one</h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">{skip}</p>
        <div className="flex flex-wrap items-start gap-3">
          <ActionButton run={dismiss}>Not for me</ActionButton>
          <TailorButton jobId={job._id} resumes={resumes} defaultResumeId={defaultResumeId ?? null} redo={false} anyway favorite={!!job.favorite} />
        </div>
        <p className="mt-3 text-xs text-ink-3">Your call. If you write it anyway, What&apos;s working on Today shows whether those pay off.</p>
      </section>
    );
  }
  return (
    <section className="card mb-6 border-accent p-6">
      <div className="label mb-1 text-accent">Next step</div>
      <h2 className="text-lg font-semibold">{text[0]}</h2>
      <p className="mt-1 mb-4 text-sm text-ink-2">{text[1]}</p>
      {stage === "score" && (
        <ActionButton run={scoreIt} pending="Scoring…">
          Score this job
        </ActionButton>
      )}
      {stage === "tailor" && <TailorButton jobId={job._id} resumes={resumes} defaultResumeId={defaultResumeId ?? null} redo={false} favorite={!!job.favorite} />}
      {stage === "interview" && (
        <div className="flex flex-wrap items-start gap-3">
          <Link href={job.status === "offer" ? `/chat?job=${job._id}` : "#prep"} className="btn btn-primary">
            {job.status === "offer" ? "Ask about the offer" : "Go to interview prep"}
          </Link>
          <Link href="/stories" className="btn btn-ghost">
            Your proof of work
          </Link>
        </div>
      )}
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
