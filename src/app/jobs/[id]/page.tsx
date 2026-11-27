"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSetStatus } from "@/components/Celebrate";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { linkedInPeopleSearch, applyBoard } from "../../../../convex/lib/company";
import { RECHECK_AFTER, SKIP_BELOW, ghostSigns, skipReason } from "../../../../convex/lib/posting";
import { nextFollowUp, REFERRAL_FOLLOW_UP_AFTER } from "../../../../convex/lib/followups";
import { CompanyMark, FitBadge, TrackTag, jobTrackKey, timeAgo } from "@/components/bits";
import { metaOf, StageChip } from "@/components/JobState";
import { hiringFor, reflow, showCompany, showTitle } from "@/lib/tidy";
import { CvMatch } from "@/components/CvMatch";
import { downloadDocx } from "@/lib/docx";
import { ApplyButton, ApplyQuestions, CompanyResearch, CoverLetter, DirectNote, EmailDraft, FavoriteStar, CallScript, HiringContacts, InterviewPrep, JobEmails, needsAnswer, OutreachCard, PeoplePicker, TailorButton, GapAnswers } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton, CopyButton, DownloadMenu, LeftToday, SentCheck } from "@/components/ui";
import { inInr, payText, useInrRates } from "@/lib/money";
import { afterApplyNudge, hrTrack, referralTrack, type Track } from "@/lib/outreachPlan";

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
        <p className="-mt-2 mb-3 text-sm text-ink-2">Find them on LinkedIn and save them here. For a call, look for a number under Contact info on their LinkedIn profile, or ask someone you both know, and add it to their card. Then message or call them in one click.</p>
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
                <p className="text-sm text-ink-2">Press &quot;Write them again&quot; under CV to get an email version too.</p>
              )}
            </div>
            <p className="text-xs text-ink-3">&quot;Hi &lt;first name&gt;&quot; is filled in with the person&apos;s name when you message them from their card above.</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-2">Tailor your CV (under CV) to get a LinkedIn note and an email for them.</p>
        )}
    </section>
  );
  // One line that tracks the referral asks for this job: how many went out, who answered, when to chase next.
  const asked = job.outreach.filter((o) => o.status !== "draft");
  const answered = asked.filter((o) => o.status === "replied" || o.status === "referred");
  const nextChase = asked
    .map((o) => nextFollowUp({ sentAt: o.sentAt, replied: o.status !== "sent", followUps: o.followUps }, REFERRAL_FOLLOW_UP_AFTER))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .sort((x, y) => x.dueAt - y.dueAt)[0];
  const referralTrack = asked.length
    ? [
        `Asked ${asked.length}`,
        `${answered.length} answered${asked.some((o) => o.status === "referred") ? " (referred you)" : ""}`,
        nextChase ? `follow-up ${nextChase.n} ${nextChase.dueAt <= now ? "due now" : `due ${new Date(nextChase.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const referralStep = (
    <section key="referral">
      <h3 className="mb-1 font-medium">Ask your connections for a referral</h3>
      {referralTrack && <p className="mb-3 text-sm text-ink-2">{referralTrack}</p>}
        {me.contactsCount === 0 ? (
          <p className="text-sm text-ink-2">
            See who you know at {job.company} with the LinkedIn buttons below. You can also load your connections under Profile →{" "}
            <Link className="underline" href="/connect">LinkedIn &amp; Gmail</Link> to keep them here.
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
        <LinkedInSearchLinks company={job.company} />
        {job.outreach.length > 0 && (
          <div className="mt-5 space-y-3">
            {job.outreach.map((o) => (
              <OutreachCard key={o.contactId + o.message.length} jobId={job._id} o={o} cvName={cvName} />
            ))}
          </div>
        )}
    </section>
  );

  // The tab for the one thing to do now: the job opens on it and it carries a "Next" mark (19 Nov: a separate
  // Next step box repeated the same buttons as the tab under it).
  const reachedOut = job.outreach.some((o) => o.status !== "draft") || (job.hiringContacts ?? []).some((c) => !!c.sentAt);
  // Ask for a referral before applying when you know someone there: the referrer can then put your name in.
  const nextTab =
    stage === "score" ? "fit"
    : stage === "tailor" ? "cv"
    // Apply is always the main step; a referral ask runs alongside it, shown in the strip above (19 Nov, owner).
    : stage === "apply" ? "apply"
    : stage === "reach" ? "people"
    : stage === "interview" ? "prepare"
    : "fit";
  // An email waiting for your answer goes to the top, above the steps.
  const answerFirst = data.emails.some(needsAnswer);
  const account = gmail?.email || me.email;
  const top = scores[0];
  const pay = payText(job.salary, rates);
  const payShown = pay ? (inInr(job.salary, rates) ? `${job.salary} (${inInr(job.salary, rates)})` : pay) : null;
  const postingTag = stale && !live ? "Checking…" : live?.state === "closed" ? "Looks closed" : live?.state === "open" ? null : "Not verified";
  const sections: Section[] = [
          {
            key: "job",
            label: "Job description",
            done: false,
            aside: job.description ? undefined : <span className="text-[13px] text-ink-3">Not saved</span>,
            content: job.description ? (
              <Description text={job.description} url={job.sourceUrl || job.url} />
            ) : (
              <div>
                <p className="text-[15px] text-ink-2">This posting&apos;s text isn&apos;t saved in JobPipe.</p>
                <a className="btn btn-secondary btn-sm mt-3" href={job.sourceUrl || job.url} target="_blank" rel="noreferrer">
                  Read the posting ↗
                </a>
              </div>
            ),
          },

          {
            key: "cv",
            label: "CV",
            done: !!job.pack,
            content: (
              <>
            {!job.pack && (
              <>
            <p className="mb-4 text-sm text-ink-2">One click writes the tailored CV, a cover letter, and a LinkedIn note and email for the hiring manager.</p>
            {skip && (
              <div className="mb-3 rounded-lg bg-warn/10 p-3 text-sm text-warn">
                {skip}{" "}
                <button type="button" className="underline" onClick={() => void setStatus({ jobId: job._id, status: "dismissed" })}>
                  Not for me
                </button>
              </div>
            )}
            <TailorButton jobId={job._id} resumes={me.resumes} defaultResumeId={currentTrack?.resumeId ?? me.defaultResumeId} redo={!!job.pack} anyway={!!skip} />
              </>
            )}
            {job.pack && (
              <div className="space-y-4">
                {/* One row: open it, change it, take it away, check it. Download and What changed came after 19 Nov's CV pass. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/jobs/${job._id}/resume`} className="btn btn-secondary btn-sm">
                    {job.pack.letterOnly ? "Open your CV" : "Open tailored CV"}
                  </Link>
                  {!job.pack.letterOnly && (
                    <Link href={`/jobs/${job._id}/resume?edit=1#edit`} className="btn btn-ghost btn-sm">
                      Edit this CV
                    </Link>
                  )}
                  <DownloadMenu pdfHref={`/jobs/${job._id}/resume?print=1`} onWord={() => void downloadDocx(job.pack!.resume, `${job.pack!.resume.name} CV ${job.company}`)} />
                  {!job.pack.letterOnly && (
                    <Link href={`/jobs/${job._id}/resume?changes=1`} className="btn btn-ghost btn-sm">
                      What changed
                    </Link>
                  )}
                </div>
                {job.pack.trackKey && trackByKey.get(job.pack.trackKey) && <p className="text-sm text-ink-2">Pitched as {trackByKey.get(job.pack.trackKey)?.name}</p>}
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
                          {f.proof ? <span className="text-ink-2">{f.proof}</span> : <span className="text-warn">Nothing in your CV shows this yet. If you&apos;ve done it, say so below and the CV can prove it.</span>}
                        </li>
                      ))}
                    </ul>
                    {!job.pack.letterOnly && (
                      <div className="mt-3">
                        <GapAnswers key={job.pack.createdAt} jobId={job._id} gaps={job.pack.fit.filter((f) => !f.proof.trim()).map((f) => f.ask)} />
                      </div>
                    )}
                  </div>
                )}
                {job.pack.shortened?.length ? <p className="text-xs text-ink-3">Fitted on two pages for this job. Left out of this copy only: {job.pack.shortened.join("; ")}.</p> : null}
                {job.pack.unverified.length > 0 ? (
                  <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">Check these numbers before sending, they aren&apos;t in your master CV: {job.pack.unverified.join(", ")}</p>
                ) : (
                  <p className="text-xs text-good">Fact check passed: every number matches your master CV.</p>
                )}
              </div>
            )}
            <CvMatch description={job.description} company={job.company} tailored={job.pack?.resume} resumeId={currentTrack?.resumeId ?? me.defaultResumeId} />
            {job.pack && (
              <details className="mt-6 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm font-medium text-ink-2 hover:text-ink">Change it or write it again</summary>
                <div className="mt-3">
                  <TailorButton jobId={job._id} resumes={me.resumes} defaultResumeId={currentTrack?.resumeId ?? me.defaultResumeId} redo anyway={!!skip} />
                </div>
              </details>
            )}
              </>
            ),
          },
          {
            key: "letter",
            label: "Cover letter",
            done: !!job.pack?.coverLetter,
            content: job.pack ? (
              <CoverLetter key={job.pack.createdAt} jobId={job._id} text={job.pack.coverLetter} resume={job.pack.resume} company={job.company} />
            ) : (
              <p className="text-sm text-ink-2">Written together with your CV. Press Write my CV under CV.</p>
            ),
          },
          {
            key: "questions",
            label: "Application questions",
            done: !!job.applyForm?.questions?.length,
            content: (
              <>
            {me.answers.length > 0 ? (
              <div className="mb-6">
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
              </>
            ),
          },
          {
            key: "people",
            label: "Outreach & calls",
            done: reachedOut,
            badge: people.length ? `${people.length} known` : undefined,
            // The call script sits with the people it's for: once you've found HR's or the hiring manager's number (19 Nov).
            content: (
              <div className="space-y-8">
                {referralFirst ? [referralStep, hiringStep] : [hiringStep, referralStep]}
                <CallScript jobId={job._id} script={job.callScript} />
              </div>
            ),
          },
          {
            key: "prepare",
            label: "Interview prep",
            done: !!job.prep,
            badge: data.interviews.length ? `${data.interviews.length} booked` : undefined,
            content: (
              <div className="space-y-6">
                {job.status === "offer" && (
                  <p className="rounded-lg bg-soft p-4 text-sm">
                    Got an offer? Check the pay against what you&apos;d ask for.{" "}
                    <Link href={`/chat?job=${job._id}`} className="underline">
                      Ask JobPipe to help you negotiate
                    </Link>
                  </p>
                )}
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
              </div>
            ),
          },
          ...(data.emails.length > 0 && !answerFirst
            ? [{ key: "emails", label: "Emails", done: false, badge: String(data.emails.length), content: <JobEmails emails={data.emails} company={job.company} account={account} meetingEndAt={job.meetingEndAt} job={job} myName={me.resume?.name ?? ""} /> }]
            : []),
  ];
  return (
    <div>
      <Link href="/jobs" className="btn-text -ml-1">
        ← All jobs
      </Link>

      {cvError && (
        <p className="card mt-4 p-4 text-[15px] text-warn" role="status">
          The job is saved, but your CV wasn&apos;t written: {cvError} You can try again under CV below.
        </p>
      )}
      <header className="mt-3 mb-6 grid grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-x-4">
        <CompanyMark job={job} size={48} />
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display-face)] text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-[28px]">{showTitle(job.title)}</h1>
          {hiringFor(job.description, job.company) && (
            <p className="mt-1 text-[15px] font-semibold text-ink">Hiring for {hiringFor(job.description, job.company)}</p>
          )}
          <p className="row-meta mt-1 !text-[15px]">
            {payShown && <span className="tnum font-semibold text-ink">{payShown} · </span>}
            {metaOf(job, null, !!hiringFor(job.description, job.company))}
            {(job.sourceUrl || job.url) && (
              <>
                {/* Its own line on a phone, so it never wraps with a stray "·" in front (27 Nov review). */}
                <a className="mt-1 block w-fit font-semibold text-ink-2 underline underline-offset-2 sm:hidden" href={job.sourceUrl || job.url} target="_blank" rel="noreferrer">
                  Original posting ↗
                </a>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 max-sm:flex-nowrap">
            <StageChip jobId={job._id} status={job.status} qualified={(top?.score ?? 0) >= SKIP_BELOW} />
            {currentTrack && <span className="mono px-1">{currentTrack.name}</span>}
            {postingTag && (
              <button type="button" className={`mono inline-flex min-h-8 items-center rounded-full px-2 ${live?.state === "closed" ? "!text-bad" : ""}`} title={live ? `${live.note} Checked ${timeAgo(live.at)}. Check again.` : "Check again"} onClick={() => void checkPosting({ jobId: job._id }).catch(() => {})}>
                {postingTag}
              </button>
            )}
            {(job.sourceUrl || job.url) && (
              <a className="btn-text max-sm:!hidden" href={job.sourceUrl || job.url} target="_blank" rel="noreferrer">
                {applyBoard(job.sourceUrl || job.url) ? `Posting on ${applyBoard(job.sourceUrl || job.url)} ↗` : "Original posting ↗"}
              </a>
            )}
          </div>
        </div>
        <FavoriteStar jobId={job._id} favorite={!!job.favorite} />
      </header>

      {ghost.level !== "none" && (
        <div className="card mb-6 p-5 text-[15px]">
          <div className={`font-semibold ${ghost.level === "likely" ? "text-warn" : ""}`}>{ghost.level === "likely" ? "This may not be a real opening" : "One thing to know"}</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
            {ghost.signs.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-ink-3">Signs, not proof. A referral or a note to the hiring manager is the quickest way to find out if they&apos;re really hiring.</p>
        </div>
      )}

      {answerFirst && (
        <div className="mb-6">
          <JobEmails emails={data.emails} company={job.company} account={account} meetingEndAt={job.meetingEndAt} job={job} myName={me.resume?.name ?? ""} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        {/* Not scored yet on a phone: the fit card comes before Apply, so the score is read before applying (27 Nov review). */}
        <aside id="job-actions" className={`lg:sticky lg:top-24 lg:order-last lg:self-start ${top ? "" : "max-lg:order-2"}`}>
          <ActionPanel
            job={job}
            peopleCount={people.length}
            now={now}
            applied={!(job.status === "new" || job.status === "applying")}
            markApplied={async () => void (await setStatus({ jobId: job._id, status: "applied" }))}
            noContacts={me.contactsCount === 0}
          />
        </aside>
        <div className={`min-w-0 space-y-6 ${top ? "" : "max-lg:contents max-lg:[&>*]:order-3"}`}>
          <section id="fit" className={`card scroll-mt-24 p-5 sm:p-6 ${top ? "" : "max-lg:!order-1"}`} aria-label="Fit">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
              <span className="flex w-11 shrink-0 flex-col items-center pt-0.5">
                <FitBadge job={job} size={44} />
                {!top && job.quickFit !== undefined && <span className="text-[11px] text-ink-3">guess</span>}
              </span>
              <div className="min-w-0 flex-1 basis-[calc(100%-60px)] sm:basis-0">
                <h2 className="h2">{top ? (top.score >= 75 ? "Strong fit" : top.score >= SKIP_BELOW ? "Good fit" : "Weaker fit") : "Not scored yet"}</h2>
                <p className="mt-1 max-w-[68ch] text-[15px] text-ink-2">{top ? top.reason : "Score it to see how it reads against your CV, and why. Uses 1 of today's scores."}</p>
                {top?.gaps.length ? <p className="mt-2 max-w-[68ch] text-[13px] text-ink-3">Gaps: {top.gaps.join("; ")}</p> : null}
              </div>
              <span className={top ? "" : "max-sm:pl-[60px]"}>
                <ActionButton run={async () => void (await scoreJobs({ jobIds: [job._id] }))} pending="Scoring" variant={top ? "text" : "ghost"} size="sm">
                  {top ? "Score again" : "Score fit"}
                </ActionButton>
                <span className="mt-1 block text-[13px] [&>span]:!text-[13px]">
                  <LeftToday kind="scoresLeft" label="scores" />
                </span>
              </span>
            </div>
            {scores.length > 1 && (
              <ul className="mt-5 space-y-3 border-t border-line pt-5">
                {scores.map((sc) => (
                  <li key={sc.trackKey} className="flex gap-3">
                    <span className="tnum w-8 shrink-0 text-[15px] font-semibold">{sc.score}</span>
                    <div className="min-w-0">
                      <TrackTag track={trackByKey.get(sc.trackKey)} />
                      <p className="mt-1 max-w-[68ch] text-[15px] text-ink-2">{sc.reason}</p>
                      {sc.gaps.length > 0 && <p className="mt-1 text-[13px] text-ink-3">Gaps: {sc.gaps.join("; ")}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {job.brief && (
              <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-[15px] sm:grid-cols-2">
                <div>
                  <dt className="label mb-1">What they really want</dt>
                  <dd className="text-ink-2">{job.brief.whatTheyWant}</dd>
                </div>
                <div>
                  <dt className="label mb-1">Watch outs</dt>
                  <dd className="text-ink-2">{job.brief.watchOuts}</dd>
                </div>
                {job.brief.blocker && (
                  <div className="sm:col-span-2">
                    <dt className="mono mb-1 !text-bad">Rules you out</dt>
                    <dd>{job.brief.blocker}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>
          {/* Phone: referral and HR come after the fit, in their own card (desktop keeps them in the action panel). */}
          <div className="lg:hidden">
            <ReachCard job={job} peopleCount={people.length} now={now} noContacts={me.contactsCount === 0} />
          </div>
          <JobSections sections={sections} initial={nextTab} openDescription={!top && !!job.description} hasDescription={!!job.description} />
        </div>
      </div>
      {(job.status === "new" || job.status === "applying") && <PhoneApplyBar job={job} />}
    </div>
  );
}

type Section = { key: string; label: string; done: boolean; badge?: string; aside?: React.ReactNode; content: React.ReactNode };

/**
 * The rest of the job as sections in one card, each opening in place: CV, cover letter, questions, people,
 * interview prep, emails, the description. The next step starts open. A link to #cv, #people or #prep opens it.
 * (Replaced the tab menu, 27 Nov design round 1: tabs were cut off on a phone.)
 */
function JobSections({ sections, initial, openDescription, hasDescription }: { sections: Section[]; initial: string; openDescription?: boolean; hasDescription?: boolean }) {
  const [open, setOpen] = useState<Set<string>>(() => {
    // The description starts open while the job isn't scored (it's the thing to read) and on wide screens; the rest
    // start closed, since the action panel holds the next step. A #link opens its section.
    const keys = new Set<string>();
    try {
      if (openDescription || (hasDescription && window.matchMedia("(min-width: 1280px)").matches)) keys.add("job");
    } catch {}
    void initial;
    try {
      const hash = window.location.hash.slice(1);
      keys.add(hash === "prep" ? "prepare" : hash);
    } catch {}
    return keys;
  });
  useEffect(() => {
    const go = () => {
      const hash = window.location.hash.slice(1);
      const key = hash === "prep" ? "prepare" : hash;
      if (key === "fit") return void requestAnimationFrame(() => document.getElementById("fit")?.scrollIntoView({ block: "start" }));
      if (!sections.some((t) => t.key === key)) return;
      setOpen((o) => new Set([...o, key]));
      requestAnimationFrame(() => document.getElementById(`step-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener("hashchange", go);
    // Arriving with a #fit / #cv / #people link: bring it into view once the page is drawn.
    if (window.location.hash) go();
    return () => window.removeEventListener("hashchange", go);
  }, [sections]);
  return (
    <div className="card overflow-hidden">
      {sections.map((t) => {
        const on = open.has(t.key);
        return (
          <section key={t.key} id={`step-${t.key}`} className="scroll-mt-24 border-t border-line first:border-t-0">
            <h2>
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen((o) => (o.has(t.key) ? new Set([...o].filter((k) => k !== t.key)) : new Set([...o, t.key])))}
                className="flex min-h-14 w-full items-center gap-3 px-5 text-left [@media(hover:hover)]:hover:bg-soft"
              >
                <span className="row-title flex-1">{t.label}</span>
                {t.done && <span className="mono">Done</span>}
                {!t.done && t.key === initial && <span className="mono !text-ink">Next</span>}
                {t.badge && <span className="tnum text-[13px] text-ink-3">{t.badge}</span>}
                {t.aside}
                <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-ink-3 transition-transform duration-150 ${on ? "rotate-180" : ""}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </h2>
            {on && <div className="min-w-0 px-5 pt-1 pb-6">{t.content}</div>}
          </section>
        );
      })}
    </div>
  );
}

type Stage = "score" | "tailor" | "apply" | "reach" | "interview" | "done";

/**
 * LinkedIn's own people search, filtered to your connections at this company. LinkedIn's data download stopped
 * including where connections work (Dec 2026, seen by a member on 22 Nov), so the count above can come up empty;
 * this always works, costs nothing, and LinkedIn shows the people itself.
 */
function LinkedInSearchLinks({ company }: { company: string }) {
  const search = (network: "F" | "S") =>
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}&network=${encodeURIComponent(JSON.stringify([network]))}&origin=FACETED_SEARCH`;
  return (
    <p className="mt-3 flex flex-wrap gap-2 text-sm">
      <a className="btn btn-ghost btn-sm" href={search("F")} target="_blank" rel="noreferrer">
        See your connections at {company} on LinkedIn ↗
      </a>
      <a className="btn btn-ghost btn-sm" href={search("S")} target="_blank" rel="noreferrer">
        People one intro away ↗
      </a>
    </p>
  );
}

/** Open a step below (Referral, HR & calls; Apply) even when the address already points at it. */
function openStep(key: string) {
  if (window.location.hash === `#${key}`) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = key;
}


/**
 * The action column: Apply ↗ (the one lime button), the CV, "I've applied", then a referral and a note to HR, each
 * with where it stands and its next step. The asks run alongside applying, never before it (19 Nov, owner).
 */
function ActionPanel({
  job,
  peopleCount,
  now,
  applied,
  markApplied,
  noContacts,
}: {
  job: Parameters<typeof ApplyButton>[0]["job"] & { outreach: Parameters<typeof referralTrack>[0]; hiringContacts?: Parameters<typeof hrTrack>[0] };
  peopleCount: number;
  now: number;
  applied: boolean;
  markApplied: () => Promise<void>;
  /** No LinkedIn connections loaded: "No connections here" would be a guess, so point to LinkedIn's own search. */
  noContacts: boolean;
}) {
  if (job.status === "rejected" || job.status === "dismissed") return null;
  const tracked = referralTrack(job.outreach, peopleCount, job.company, now);
  // The company you'd be working for: the one a recruiter's posting is for, else the poster, spelled cleanly.
  const employer = hiringFor(job.description, job.company) ?? showCompany(job.company);
  const referral: Track = noContacts && tracked.tone === "off" ? { tone: "todo", line: `Search LinkedIn for people you know at ${employer}.`, action: "Search" } : tracked;
  const hr = hrTrack(job.hiringContacts ?? [], now);
  const nudge = afterApplyNudge(job, peopleCount > 0, now);
  const best = job.outreach.find((o) => o.status === "draft")?.name;
  const rows: { key: string; label: string; t: Track }[] = [
    { key: "referral", label: "Referral", t: referral },
    { key: "hr", label: "HR or hiring manager", t: hr },
  ];
  return (
    <section className="card p-5" aria-label="Apply and reach out">
      {applied ? (
        <p className="text-[15px] font-semibold">Applied{job.appliedAt ? ` ${timeAgo(job.appliedAt)}` : ""}</p>
      ) : (
        <div className="space-y-2">
          <ApplyButton job={job} full />
          {job.pack ? (
            <Link href={`/jobs/${job._id}/resume?print=1`} className="btn btn-secondary w-full">
              Download CV
            </Link>
          ) : (
            <>
              <button type="button" className="btn btn-secondary w-full" onClick={() => openStep("cv")}>
                Tailor my CV
              </button>
              {/* What it uses, right at the button (27 Nov review). */}
              <p className="-mt-1 text-center text-[13px] [&>span]:!text-[13px]">
                <LeftToday kind="cvsLeft" label="tailored CVs" />
              </p>
            </>
          )}
          <div className="flex justify-center">
            <ActionButton run={markApplied} variant="text">
              Mark applied
            </ActionButton>
          </div>
          {/* Asked once on coming back from the company's form (ApplyButton notes the open). */}
          <SentCheck id={`apply:${job._id}`} onSent={markApplied} question="Did you apply?" yes="Yes, applied" />
          <details className="pt-1 text-[13px] text-ink-3">
            <summary className="min-h-11 cursor-pointer list-none py-3 [&::-webkit-details-marker]:hidden">
              Apply opens the job&apos;s form and downloads your CV.{" "}
              <span className="font-semibold whitespace-nowrap text-ink-2 underline underline-offset-2">Fill forms faster (optional)</span>
            </summary>
            <p className="mt-2">
              Add the JobPipe form filler to your browser once: it&apos;s a button you keep in your bookmarks bar. On a job form, click it and it types
              in your details and answers and attaches your CV. You check everything and press Submit yourself.{" "}
              <Link className="underline" href="/resume#autofill">
                Add the form filler (1 minute)
              </Link>
            </p>
          </details>
        </div>
      )}
      {nudge && (
        <p className="mt-4 text-[15px] text-ink-2">
          {nudge === "referral"
            ? `Also ask ${best ? best.split(" ")[0] : `one of the ${peopleCount} people you know there`} for a referral: a referred application gets read first.`
            : "Also message the hiring manager or HR: a short note puts a name to your application."}
        </p>
      )}
      <ul className="mt-5 border-t border-line max-lg:hidden">
        {rows.map(({ key, label, t }) => (
          <li key={key} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
            <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => openStep("people")}>
              <span className="row-title block !text-[14px]">{label}</span>
              <span className={`row-meta block ${t.tone === "good" ? "!text-good" : ""}`}>{t.line}</span>
            </button>
            {t.action && (
              <button type="button" onClick={() => openStep("people")} className="btn btn-secondary btn-sm shrink-0">
                {t.action}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where boards cut long descriptions (convex/agent.ts, careersRefresh.ts). */
const DESCRIPTION_CAP = 8000;

/**
 * The posting's text at a readable width. Short lines with no full stop ("About Us") read as small headings. A text
 * cut at the stored limit ends at its last whole paragraph, with a link to the full posting (27 Nov review: "Mai").
 */
/**
 * Lines of a posting as headings, lists and paragraphs. A short line on its own is a heading; short lines in a row,
 * or lines starting with a bullet, are a list (27 Nov review: "Strong communication…" requirements showed as headings).
 */
type Block = { kind: "h" | "p"; text: string } | { kind: "ul"; items: string[] };
function describe(lines: string[]): Block[] {
  const bullet = (b: string) => /^[-•*·▪●]\s*/.test(b);
  const short = (b?: string) => !!b && b.length < 60 && !/[.;,]$/.test(b) && !bullet(b);
  const out: Block[] = [];
  lines.forEach((b, i) => {
    const prev = lines[i - 1];
    const next = lines[i + 1];
    // The first short line of a run that reads like a section name ("What you'll bring") stays a heading.
    const sectionName = short(b) && !short(prev) && /^(what|about|your|the role|role|responsibilit|requirement|qualification|key|who|why|benefit|perks|nice to have|preferred|must have|skills|experience|we offer|you('ll| will)|job description|summary|overview|compensation)/i.test(b);
    const listy = !sectionName && (bullet(b) || (short(b) && !/:$/.test(b) && ((short(prev) && !/:$/.test(prev!)) || (short(next) && !/:$/.test(next!)))));
    if (listy) {
      const item = b.replace(/^[-•*·▪●]\s*/, "");
      const last = out.at(-1);
      if (last?.kind === "ul") last.items.push(item);
      else out.push({ kind: "ul", items: [item] });
    } else out.push({ kind: short(b) || (/:$/.test(b) && b.length < 60) ? "h" : "p", text: b.replace(/:$/, "") });
  });
  return out;
}

function Description({ text: raw, url }: { text: string; url: string }) {
  const text = reflow(raw);
  const cut = text.length >= DESCRIPTION_CAP - 10;
  const shown = cut ? text.slice(0, text.lastIndexOf("\n", DESCRIPTION_CAP) > 0 ? text.lastIndexOf("\n", DESCRIPTION_CAP) : text.lastIndexOf(". ") + 1) : text;
  const blocks = shown.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (
    <div className="max-w-[68ch] space-y-3 text-[15px] leading-relaxed text-ink-2">
      {describe(blocks).map((g, i) =>
        g.kind === "h" ? (
          <h3 key={i} className="pt-2 text-[13px] font-semibold text-ink">
            {g.text}
          </h3>
        ) : g.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-ink-3">
            {g.items.map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{g.text}</p>
        ),
      )}
      {cut && url && (
        <a className="btn-text -ml-1" href={url} target="_blank" rel="noreferrer">
          Read the full posting ↗
        </a>
      )}
    </div>
  );
}

/** Phone only: once the action card has scrolled away, Apply ↗ stays in reach just above the tab bar. */
function PhoneApplyBar({ job }: { job: Parameters<typeof ApplyButton>[0]["job"] }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById("job-actions");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!show) return null;
  return (
    <div className="tabbar sheet fixed inset-x-0 z-30 border-t border-line px-4 py-2 lg:hidden" style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}>
      <ApplyButton job={job} full />
    </div>
  );
}

/** Phone only: the referral and HR rows as their own card under the fit. */
function ReachCard({ job, peopleCount, now, noContacts }: { job: Parameters<typeof ActionPanel>[0]["job"]; peopleCount: number; now: number; noContacts: boolean }) {
  if (job.status === "rejected" || job.status === "dismissed") return null;
  const tracked = referralTrack(job.outreach, peopleCount, job.company, now);
  const referral: Track = noContacts && tracked.tone === "off" ? { tone: "todo", line: `Search LinkedIn for people you know at ${hiringFor(job.description, job.company) ?? showCompany(job.company)}.`, action: "Search" } : tracked;
  const hr = hrTrack(job.hiringContacts ?? [], now);
  return (
    <ul className="card px-5" aria-label="Referral and HR">
      {[
        { key: "referral", label: "Referral", t: referral },
        { key: "hr", label: "HR or hiring manager", t: hr },
      ].map(({ key, label, t }) => (
        <li key={key} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
          <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => openStep("people")}>
            <span className="row-title block !text-[14px]">{label}</span>
            <span className={`row-meta block ${t.tone === "good" ? "!text-good" : ""}`}>{t.line}</span>
          </button>
          {t.action && (
            <button type="button" onClick={() => openStep("people")} className="btn btn-secondary btn-sm shrink-0">
              {t.action}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
