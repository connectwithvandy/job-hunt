"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { isArchived } from "@/lib/archive";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { companyKey, linkedInPeopleSearch } from "../../convex/lib/company";
import { nextFollowUp, REFERRAL_FOLLOW_UP_AFTER, replyTiming } from "../../convex/lib/followups";
import { rankFit, SKIP_BELOW, TAILOR_FROM } from "../../convex/lib/posting";
import { openTo, readPlace } from "../../convex/lib/sources";
import { BANDS, SILENT_AFTER, countNoes, tallyBy, tallyOutcomes, type Tally } from "../../convex/lib/outcomes";
import type { Doc } from "../../convex/_generated/dataModel";
import { useCelebrateNewWins, WIN_WORDS } from "@/components/Celebrate";
import { CompanyMark, DAY_STARTS_AT, FitBadge, likelyScore, ScorePill, bestScore, dayStart, jobTrackKey, timeAgo } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { SetupGuide } from "@/components/SetupGuide";
import { PlacesPopup } from "@/components/PlacesPopup";
import { payText, useInrRates } from "@/lib/money";
import { answerRank, justInterviewed, waitsForAnswer } from "@/lib/replies";
import { ActionButton } from "@/components/ui";
import { ReferralFollowUp } from "@/components/job-client";

const DAY = 86_400_000;
/** After this long, Today asks for a fresh connections file: people keep connecting. */
const CONNECTIONS_STALE = 30 * DAY;

/** A steady day's outreach: new companies asked for a referral, and applications sent. */
const COMPANIES_A_DAY = 10;
const APPLIES_A_DAY = 5;

/** Jobs still worth chasing: not closed, not set aside. */
const stillChasing = (status: string) => status !== "rejected" && status !== "dismissed" && status !== "offer";

function msSince(when: number) {
  return Date.now() - when;
}

/** Whether it's still before 8:00 in India (02:30 UTC), when the morning autopilot runs. */
function beforeEightInIndia() {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes() < 2 * 60 + 30;
}

/** Why a first search from onboarding failed, if one did. */
function firstSearchError() {
  try {
    return sessionStorage.getItem("firstSearchError") ?? "";
  } catch {
    return "";
  }
}

/** Whether onboarding started the first searches in the last five minutes. */
function startedFirstSearch() {
  try {
    return Date.now() - Number(sessionStorage.getItem("firstSearchAt") ?? 0) < 5 * 60_000;
  } catch {
    return false;
  }
}

export default function Today() {
  const me = useQuery(api.users.me);
  // Same query as the menu (shared, not fetched twice), so the greeting uses the same name.
  const account = useQuery(api.access.mine);
  const [searching] = useState(startedFirstSearch);
  const [searchError] = useState(firstSearchError);
  const jobs = useQuery(api.jobs.list);
  const prefs = useQuery(api.users.jobPrefs);
  const prospects = useQuery(api.prospects.list);
  const stories = useQuery(api.stories.list);
  const warm = useQuery(api.contacts.warmCompanies);
  const interviews = useQuery(api.inbox.upcoming);
  const [now] = useState(() => Date.now());
  const markSeen = useMutation(api.users.markSeen);
  useEffect(() => void markSeen().catch(() => {}), [markSeen]);
  // The tab says where you are, not the website's sales line (19 Nov walk).
  useEffect(() => {
    const before = document.title;
    document.title = "Today · JobPipe";
    return () => {
      document.title = before;
    };
  }, []);
  if (!me || !jobs) return <Loading />;
  // The name on the account first, so the greeting matches the menu; the CV name only if none was given.
  const firstName = (account?.name || me.resume?.name || "").split(" ")[0];

  // An active role whose titles find nothing: worth fixing before anything else in step 2.
  const emptyRoles = me.tracks.filter((t) => t.status === "active" && !jobs.some((j) => jobTrackKey(j, me.tracks) === t.key));

  const unscored = jobs.filter((j) => j.status === "new" && !j.scores?.length);
  // Found today isn't new: a role posted months ago is likely filled, and one in another city isn't for you.
  const place = readPlace(me.location);
  const nearby = (j: Doc<"jobs">) => j.source === "pasted" || j.source === "link" || j.location === "Not listed" || openTo(place, j.location, j.workSetting, j.title);
  const recent = (j: Doc<"jobs">) => !j.postedAt || !(msSince(Date.parse(j.postedAt)) > 30 * DAY);
  // Archived postings (closed, or older than the limit in Job preferences) never show on Today: same rule as Jobs → Archived.
  const live = (j: Doc<"jobs">) => !isArchived(j, now, prefs?.maxAgeDays);
  const strongAll = jobs
    // A closed posting or one that rules you out isn't worth the evening.
    .filter((j) => j.status === "new" && (bestScore(j)?.score ?? 0) >= 75 && live(j) && !j.brief?.blocker && nearby(j))
    .sort((a, b) => rankFit(bestScore(b)!.score, b) - rankFit(bestScore(a)!.score, a));
  const strong = strongAll.slice(0, 5);
  // The same rule as Messages' "Needs you": offers and interview invites first, then newest.
  const replies = jobs.filter((j) => waitsForAnswer(j, now)).sort((a, b) => answerRank(a) - answerRank(b) || b.lastEmail!.at - a.lastEmail!.at);
  // Interviews that already happened this week: say how it went and thank them, instead of "answer it".
  const interviewed = jobs.filter((j) => justInterviewed(j, now));
  const drafts = jobs.flatMap((j) => j.outreach.filter((o) => o.status === "draft").map((o) => ({ j, o })));
  // Follow-ups that are due: referral asks and messages to hiring managers that got no reply in a week.
  const followUps = jobs.flatMap((j) => [
    ...j.outreach.map((o) => ({ j, name: o.name, o, n: nextFollowUp({ sentAt: o.status === "sent" ? o.sentAt : undefined, replied: false, followUps: o.followUps }, REFERRAL_FOLLOW_UP_AFTER) })),
    ...(j.hiringContacts ?? []).map((c) => ({ j, name: c.name, o: undefined, n: nextFollowUp({ sentAt: c.sentAt, replied: !!c.repliedAt, followUps: c.followUps }) })),
  ]).filter((f) => f.n && f.n.dueAt <= now && stillChasing(f.j.status));
  const quiet = jobs.filter((j) => j.status === "applied" && j.appliedAt && msSince(j.appliedAt) > 10 * DAY);
  const raised = (prospects ?? [])
    .filter((p) => p.source === "funded" && p.status === "new" && msSince(p._creationTime) < 14 * DAY)
    .sort((a, b) => (b.fit?.score ?? 0) - (a.fit?.score ?? 0))
    .slice(0, 2);

  // Every three new noes, there's something new to learn from them.
  const noes = countNoes(jobs, now);
  const learn = noes >= 3 && (!me.lessons || noes - me.lessons.basedOn >= 3);
  const interviewing = jobs.filter((j) => j.status === "interview");

  // What you've done since the day started (4 AM), so late nights still count and the day starts fresh each morning.
  const dayBegan = dayStart(now);
  const sentToday = (at?: number) => !!at && at >= dayBegan;
  const companiesAskedToday = new Set(
    jobs.filter((j) => j.outreach.some((o) => sentToday(o.sentAt)) || (j.hiringContacts ?? []).some((c) => sentToday(c.sentAt))).map((j) => companyKey(j.company)),
  ).size;
  const appliedToday = jobs.filter((j) => sentToday(j.appliedAt)).length;
  // Every company you've sent someone a message at; drafts don't count.
  const askedTotal = new Set(
    jobs.filter((j) => j.outreach.some((o) => o.sentAt) || (j.hiringContacts ?? []).some((c) => c.sentAt)).map((j) => companyKey(j.company)),
  ).size;
  // Every application so far, including ones moved on to interviews or a no.
  const appliedTotal = jobs.filter((j) => j.appliedAt || ["applied", "screening", "interview", "offer", "rejected"].includes(j.status)).length;
  // The next companies from your top 50 that you haven't asked anyone at yet: a few a day, after the routine.
  const askedAt = new Set(jobs.filter((j) => j.outreach.length || (j.hiringContacts ?? []).some((c) => c.sentAt)).map((j) => companyKey(j.company)));
  const toAsk = (warm ?? []).map((c, rank) => ({ c, rank })).filter(({ c }) => !askedAt.has(c.key)).slice(0, Math.max(0, Math.min(3, COMPANIES_A_DAY - companiesAskedToday)));

  // 1. People who wrote back: companies by email, connections who answered a referral ask, hiring managers.
  const open = (j: Doc<"jobs">) => j.status === "new" || j.status === "applying";
  const answer: Todo[] = [
    // Company replies (interview invites, recruiter emails) sit in their own box at the top of the page instead.
    ...jobs.flatMap((j) =>
      j.outreach
        .filter((o) => (o.status === "replied" || o.status === "referred") && open(j))
        .map((o) => ({
          key: `o${j._id}${o.contactId}`,
          verb: o.status === "referred" ? "Apply" : "Reply",
          main: o.name,
          sub: o.status === "referred" ? `Referred you for ${j.title} at ${j.company}. Apply now and thank them.` : `Answered your ask about ${j.title} at ${j.company}`,
          href: `/jobs/${j._id}`,
        })),
    ),
    ...jobs.flatMap((j) =>
      (j.hiringContacts ?? [])
        .filter((c) => c.repliedAt && msSince(c.repliedAt) < 7 * DAY && stillChasing(j.status) && !["interview", "offer"].includes(j.status))
        .map((c) => ({ key: `h${j._id}${c.name}`, verb: "Reply", main: c.name, sub: `Wrote back ${timeAgo(new Date(c.repliedAt!).toISOString())} about ${j.title} at ${j.company}`, href: `/jobs/${j._id}` })),
    ),
    // Without Gmail, replies can't show up here, so "Done" would be a guess.
    ...(!me.inboxAt || msSince(me.inboxAt) > DAY
      ? [{ key: "gmail", verb: "Connect", main: me.inboxAt ? "Gmail stopped checking" : "Connect Gmail so replies show up here", sub: "Recruiter replies and interview invites land here by themselves. Set it up once under Profile → LinkedIn & Gmail.", href: "/connect" }]
      : []),
    ...(interviewing.length && stories?.length === 0
      ? [{ key: "stories", verb: "Prepare", main: "Your proof of work", sub: `${interviewing.length} interview${interviewing.length > 1 ? "s" : ""} coming. Six examples cover most questions.`, href: "/stories" }]
      : []),
  ];

  // 2. Jobs found in the last 24 hours that fit, best first: applying early gets more replies.
  // AI-scored jobs rank above first guesses, which run high.
  const fit = (j: Doc<"jobs">) => bestScore(j)?.score ?? j.quickFit ?? 0;
  const fresh = jobs
    .filter((j) => j.status === "new" && now - j._creationTime < DAY && fit(j) >= SKIP_BELOW && live(j) && !j.brief?.blocker && nearby(j) && recent(j))
    .sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || rankFit(fit(b), b) - rankFit(fit(a), a));
  const freshIds = new Set(fresh.map((j) => j._id));
  const freshScored = fresh.filter((j) => j.scores?.length);
  const freshGuessed = fresh.filter((j) => !j.scores?.length);
  const freshUnscored = freshGuessed.length;
  // Older strong fits fill in when there's little new that the AI has scored.
  const older = strong.filter((j) => !freshIds.has(j._id)).slice(0, Math.max(0, APPLIES_A_DAY - freshScored.length));
  // A 70+ fit with no tailored CV yet: tailoring is the next step, and the one people skip (62 scored, 18 tailored, 14 Nov).
  // Not scored yet: check the fit first ("Apply" on a first guess told new people to apply before scoring, 16 Nov walk).
  const verbFor = (j: Doc<"jobs">) => (!bestScore(j) ? "Check" : bestScore(j)!.score >= TAILOR_FROM && !j.hasPack && !j.pack ? "Tailor" : "Apply");
  const applyNew = (list: Doc<"jobs">[]) =>
    list.map((j) => ({
      key: `n${j._id}`,
      verb: verbFor(j),
      main: `${j.title} at ${j.company}`,
      // Found today isn't posted today: a role up for weeks may be filled.
      sub: [j.postedAt ? `Posted ${timeAgo(j.postedAt)}` : `Found ${timeAgo(new Date(j._creationTime).toISOString())}`, bestScore(j) ? `Fit ${bestScore(j)!.score}` : `First guess ~${likelyScore(j.quickFit ?? 0)}, not scored yet`].join(" · "),
      href: `/jobs/${j._id}`,
    }));
  // AI-scored jobs first, new then older; first guesses after them, never ahead of a real score.
  const firstPick = [...freshScored.slice(0, 8), ...older, ...freshGuessed.slice(0, Math.max(0, 8 - freshScored.length))];
  // A quiet morning still fills the row: the best open jobs not applied to yet, real scores first (19 Nov: only 2 cards).
  const picked = new Set(firstPick.map((j) => j._id));
  const fillers = jobs
    .filter((j) => j.status === "new" && !picked.has(j._id) && live(j) && !j.brief?.blocker && nearby(j) && fit(j) >= SKIP_BELOW)
    .sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || rankFit(fit(b), b) - rankFit(fit(a), a))
    .slice(0, 8);
  // Shown in the order the eye reads the rings: real scores highest first, then first guesses highest first
  // (19 Nov: 84, ~50, 70, 74, 68 looked random).
  const shownFit = (j: Doc<"jobs">) => bestScore(j)?.score ?? likelyScore(j.quickFit ?? 0);
  const bestNew = [...firstPick, ...fillers].sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || shownFit(b) - shownFit(a));
  void applyNew;
  // Started but not sent: these are still to do, not live applications (19 Nov walk).
  const gettingReady = jobs.filter((j) => j.status === "applying" && j.liveCheck?.state !== "closed");
  const apply: Todo[] = [
    ...gettingReady.map((j) => ({ key: `g${j._id}`, verb: "Apply", main: `${j.title} at ${j.company}`, sub: "Started, not sent yet. Finish and send the application.", href: `/jobs/${j._id}` })),
    ...emptyRoles.map((t) => ({ key: `e${t._id}`, verb: "Fix", main: `${t.name} finds no jobs`, sub: "Its job titles may be too narrow. Add the titles companies actually use.", href: "/tracks" })),
    // One line for scoring (19 Nov: new jobs and older ones were two lines saying the same thing).
    ...(unscored.length ? [{ key: "score", verb: "Score", main: `Check the fit of ${unscored.length} ${unscored.length === 1 ? "job" : "jobs"} not scored yet`, sub: freshUnscored ? `${freshUnscored} found in the last day. The ~% is a first guess; the real score reads the whole job.` : "The ~% is a first guess; the real score reads the whole job.", href: "/jobs?fit=unscored" }] : []),
  ];

  // 3. Messages and applications with no answer yet.
  const chase: Todo[] = [
    // Many drafts read as a wall of the same line (19 Nov: 18 of 19 to-dos), so more than one becomes a single line.
    ...(drafts.length > 1
      ? [{ key: "drafts", verb: "Send", main: `${drafts.length} referral notes ready to send`, sub: "Written for you. Read each one, then send it from Messages.", href: "/inbox?show=ready" }]
      : drafts.map(({ j, o }) => ({ key: `d${j._id}${o.contactId}`, verb: "Send", main: `Referral note to ${o.name}`, sub: `Drafted, not sent yet · ${j.title} at ${j.company}`, href: `/jobs/${j._id}` }))),
    // A referral ask's follow-up opens right here, written and ready to copy.
    ...followUps.map(({ j, name, n, o }) => ({
      key: `f${j._id}${name}${n!.n}`,
      verb: "Follow up",
      main: name,
      sub: `Follow-up ${n!.n} about ${j.title} at ${j.company}, no reply yet`,
      href: `/jobs/${j._id}`,
      panel: o ? <ReferralFollowUp jobId={j._id} o={o} /> : undefined,
    })),
    ...quiet.map((j) => ({ key: `q${j._id}`, verb: "Follow up", main: `${j.title} at ${j.company}`, sub: `Applied ${timeAgo(j.appliedAt)}, no answer yet`, href: `/jobs/${j._id}` })),
  ];

  // 4. New companies to open up, once the rest is done.
  const reach: Todo[] = [
    // One section for referrals: it used to repeat as a card at the top of the page too (13 Nov).
    ...toAsk.map(({ c }) => {
      const p = c.people[0];
      return {
        key: `a${c.key}`,
        verb: "Ask",
        main: p ? `${p.firstName} ${p.lastName} at ${c.company}` : c.company,
        sub: [c.jobs[0]?.title, p?.position, c.peopleCount > 1 ? `you know ${c.peopleCount} there` : null, c.funding ? "just raised" : null].filter(Boolean).join(" · "),
        href: `/jobs/${c.jobs[0]._id}`,
      };
    }),
    ...raised.map((p) => ({ key: `r${p._id}`, verb: "Reach out", main: p.name, sub: `Just raised: ${p.funding ?? "new funding"}`, href: `/companies?open=${p._id}` })),
  ];

  // The job the guide points to: the best fit still open, else any open one.
  const bestToOpen = [...jobs].filter((j) => j.status === "new" || j.status === "applying").sort((a, b) => fit(b) - fit(a))[0];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
          <span className="ml-3 text-sm font-normal text-ink-3">{new Date(dayStart(now)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
        </h1>
        <Autopilot on={me.autopilot} last={me.lastAutopilot} now={now} found={jobs.length} strongNow={strongAll.length} />
      </header>

      {!me.placesAsked && <PlacesPopup location={me.location} workModes={me.workModes} />}
      <SetupGuide
        hold={!me.placesAsked}
        progress={{
          hasCv: !!me.resume,
          roles: me.tracks.length,
          contacts: me.contactsCount,
          jobs: jobs.length,
          scored: jobs.filter((j) => j.scores?.length).length,
          tailored: jobs.filter((j) => j.hasPack || j.pack).length,
          applied: appliedTotal,
        }}
        bestJob={bestToOpen?._id}
        foundNote={jobs.length ? firstFound(jobs, searching) : searchError ? `The first search didn't work: ${searchError} Try again on the Jobs page.` : searching ? "Finding your first jobs now. They'll appear here in a minute or two." : "Search on the Jobs page, or paste a job description."}
      />
      {me.contactsCount > 0 && me.contactsLoadedAt && now - me.contactsLoadedAt > CONNECTIONS_STALE && (
        <section className="card mb-8 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-medium">Refresh your LinkedIn connections</p>
            <p className="mt-1 text-sm text-ink-2">You loaded them {timeAgo(new Date(me.contactsLoadedAt).toISOString())}. Anyone you&apos;ve connected with since won&apos;t show up on your jobs yet.</p>
          </div>
          <Link href="/connect" className="btn btn-primary btn-sm">
            Refresh
          </Link>
        </section>
      )}

      <CelebrateWins jobs={jobs} now={now} />
      <NeedsAnswer jobs={replies} />
      <AfterInterview jobs={interviewed} />
      <SearchStrip
        jobs={jobs}
        trialEndsAt={account && !account.isOwner && !account.paidUntil && !account.trialOver ? (account.trialEndsAt ?? undefined) : undefined}
        now={now}
        today={[
          { label: "Applied today", done: appliedToday, goal: APPLIES_A_DAY },
          { label: "Asked today", done: companiesAskedToday, goal: COMPANIES_A_DAY },
        ]}
        askedTotal={askedTotal}
      />

      {!!interviews?.length && (
        <section className="card mb-8 p-6">
          <h2 className="mb-4 text-lg font-semibold">Interviews coming up</h2>
          <ul className="divide-y divide-line text-sm">
            {interviews.map((i) => (
              <li key={i._id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <Link href={`/jobs/${i.jobId}`} className="min-w-0">
                  <span className="font-medium">{i.job ? `${i.job.company}: ${i.job.title}` : i.title}</span>
                  <span className="block text-xs text-ink-3">{i.title}</span>
                </Link>
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
        </section>
      )}

      <BestNew jobs={bestNew} verbFor={verbFor} />
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <LiveApplications jobs={jobs} />
        </div>
        <div className="min-w-0">
          <Step
            n={1}
            title="To do today"
            items={[...answer, ...chase, ...reach, ...apply]}
            empty={me.contactsCount ? "Nothing waiting on you. Open a job above, or find people to ask in Messages." : "Nothing waiting on you. Load your LinkedIn connections (Profile → LinkedIn & Gmail) to see who you know at each company."}
          />
        </div>
      </div>


      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">
          See more: what&apos;s working{learn ? ` (${noes} noes and silences to learn from)` : ""}, newly funded companies
        </summary>
        <div className="mt-6">
          <WhatsWorking jobs={jobs} tracks={me.tracks} lessons={me.lessons} />
          <JustRaised prospects={prospects ?? []} />
        </div>
      </details>

    </div>
  );
}

/** Today's best jobs as cards: fit, pay and place at a glance, Skip or the next step in one tap. */
function BestNew({ jobs, verbFor }: { jobs: Doc<"jobs">[]; verbFor: (j: Doc<"jobs">) => string }) {
  const setStatus = useMutation(api.jobs.setStatus);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());
  const rates = useInrRates();
  // A posting over 4 months old isn't a "new" job, even when it scores well (19 Nov: an 8-month-old SDR role here).
  const shown = jobs.filter((j) => !skipped.has(j._id) && !(j.postedAt && now - Date.parse(j.postedAt) > 120 * 86_400_000)).slice(0, 5);
  return (
    <section className="rise mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Recommended for you</h2>
        <Link href="/jobs" className="text-sm text-ink-2 hover:text-ink">
          All jobs →
        </Link>
      </div>
      {shown.length === 0 ? (
        <div className="card p-5 text-sm text-ink-2">Nothing new that fits in the last 24 hours. Tomorrow morning&apos;s search adds more, or search now on Jobs.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {shown.map((j) => {
            const verb = verbFor(j);
            // Only pay the posting lists; no guesses (owner, 19 Nov).
            const pay = payText(j.salary, rates);
            return (
              <li key={j._id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <CompanyMark job={j} size={40} />
                  <FitBadge job={j} />
                </div>
                <div className="mt-3 text-xs text-ink-3">{j.company}</div>
                <Link href={`/jobs/${j._id}`} className="font-medium leading-snug hover:underline">
                  {j.title}
                </Link>
                {pay && <div className="mt-3 text-sm font-medium">{pay}</div>}
                {/* Place and date on their own lines, so "posted 10d ago" is never cut off. */}
                <div className={`${pay ? "mt-0.5" : "mt-3"} truncate text-xs text-ink-3`}>{j.location}</div>
                {j.postedAt && <div className="text-xs text-ink-3">Posted {timeAgo(j.postedAt)}</div>}
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <button
                    type="button"
                    className="px-2 text-sm text-ink-3 hover:text-ink"
                    onClick={() => {
                      setSkipped(new Set([...skipped, j._id]));
                      void setStatus({ jobId: j._id, status: "dismissed" }).catch(() => {});
                    }}
                  >
                    Skip
                  </button>
                  <Link href={`/jobs/${j._id}`} className="btn btn-primary btn-sm flex-1 justify-center">
                    {/* One rule per state: no real score yet, no CV for this job yet, CV ready (19 Nov: a 68 said "Apply" with no CV). */}
                    {verb === "Check" ? "Check the fit" : j.hasPack || j.pack ? "Apply" : "Write my CV"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const LIVE: Record<string, string> = { applying: "Getting ready", applied: "Applied", screening: "Screening", interview: "Interviewing", offer: "Offer" };

/**
 * One slim line on top, like Dreamwork's trial strip: where the search stands overall, today's two goals,
 * and when replies usually come, so a quiet first week doesn't read as failure.
 */
function SearchStrip({ jobs, trialEndsAt, now, today, askedTotal }: { jobs: Doc<"jobs">[]; trialEndsAt?: number; now: number; today: { label: string; done: number; goal: number }[]; askedTotal: number }) {
  const applied = jobs.filter((j) => j.appliedAt || ["applied", "screening", "interview", "offer", "rejected"].includes(j.status)).length;
  const replies = jobs.filter((j) => ["screening", "interview", "offer"].includes(j.status)).length;
  const interviews = jobs.filter((j) => j.status === "interview" || j.status === "offer").length;
  const trialDay = trialEndsAt && trialEndsAt > now ? Math.min(7, Math.max(1, 8 - Math.ceil((trialEndsAt - now) / DAY))) : null;
  return (
    <section className="card mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {trialDay ? `Trial day ${trialDay} of 7 · ` : ""}
          {applied} applied · {replies} {replies === 1 ? "reply" : "replies"} · {interviews} {interviews === 1 ? "interview" : "interviews"} · {askedTotal} {askedTotal === 1 ? "company" : "companies"} asked for a referral
        </p>
        <p className="mt-0.5 text-xs text-ink-3">Replies usually come 2 to 12 days after applying.</p>
      </div>
      <div className="flex gap-6">
        {today.map((t) => (
          <div key={t.label} className="w-32">
            <div className="flex items-baseline justify-between text-xs text-ink-3">
              <span>{t.label}</span>
              <span className="tabular-nums text-ink">
                {t.done}/{t.goal}
              </span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-soft">
              <div className="fill h-1 rounded-full bg-accent" style={{ width: `${Math.min(100, (t.done / Math.max(1, t.goal)) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Every application still moving, newest step first, as clean rows (logo, role, company · pay · place, stage),
 * with saved roles that have since closed gathered in one line to archive. Like Dreamwork's Live applications.
 */
function LiveApplications({ jobs }: { jobs: Doc<"jobs">[] }) {
  const setStatus = useMutation(api.jobs.setStatus);
  const rates = useInrRates();
  const pay = (j: Doc<"jobs">) => payText(j.salary, rates);
  const [all, setAll] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [search, setSearch] = useState("");
  const live = jobs
    .filter((j) => j.status in LIVE)
    .sort((a, b) => (b.appliedAt ?? b._creationTime) - (a.appliedAt ?? a._creationTime));
  // Saved but not sent yet, and the posting has gone: nothing to do but clear them away.
  const closed = live.filter((j) => j.status === "applying" && j.liveCheck?.state === "closed");
  const q = search.trim().toLowerCase();
  // Started but not sent yet isn't live: those sit in To do today (19 Nov walk).
  const rows = live.filter((j) => j.status !== "applying" && (!q || `${j.title} ${j.company}`.toLowerCase().includes(q)));
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <section className="rise mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Live applications <span className="text-sm font-normal text-ink-3">{rows.length}</span>
        </h2>
        {live.length > 5 && <input className="field w-48 py-1.5 text-sm" placeholder="Search applications" value={search} onChange={(e) => setSearch(e.target.value)} />}
      </div>
      {rows.length === 0 ? (
        <div className="card p-5 text-sm text-ink-2">{q ? "No application matches that." : "Nothing sent yet. Pick a job above and press Write my CV."}</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((j) => (
            <li key={j._id}>
              <Link href={`/jobs/${j._id}`} className="card flex items-center gap-3 px-3 py-2.5 hover:border-ink-3">
                <CompanyMark job={j} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{j.title}</span>
                  <span className="block truncate text-xs text-ink-3">{[j.company, pay(j), j.location].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${j.status === "interview" || j.status === "offer" ? "bg-accent text-on-accent" : j.status === "screening" ? "bg-violet/15 text-violet" : "bg-soft text-ink-2"}`}>
                  {LIVE[j.status]}
                  {j.appliedAt && j.status === "applied" ? ` ${timeAgo(new Date(j.appliedAt).toISOString())}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 8 && (
        <button type="button" className="mt-2 px-1 text-sm text-ink-3 underline hover:text-ink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
      {closed.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-soft px-4 py-3 text-sm">
          <span className="text-ink-2">
            {closed.length} saved {closed.length === 1 ? "role" : "roles"} closed since you saved {closed.length === 1 ? "it" : "them"}.
          </span>
          <button
            type="button"
            className="font-medium text-ink underline disabled:opacity-50"
            disabled={archiving}
            onClick={async () => {
              setArchiving(true);
              await Promise.all(closed.map((j) => setStatus({ jobId: j._id, status: "dismissed" }).catch(() => {})));
              setArchiving(false);
            }}
          >
            Archive all
          </button>
        </div>
      )}
      <Link href="/tracker" className="mt-3 inline-block px-1 text-sm text-ink-2 hover:text-ink">
        Open the board →
      </Link>
    </section>
  );
}

/**
 * Companies waiting on your answer (interview invites, recruiter emails, offers), first on the page:
 * they matter more than anything else here (19 Nov: a 3-day-old interview invite sat below the fold).
 */
function NeedsAnswer({ jobs }: { jobs: Doc<"jobs">[] }) {
  if (!jobs.length) return null;
  // The email says what it is; the job's own status can lag behind it.
  const what = (j: Doc<"jobs">) => {
    const s = j.lastEmail?.stage;
    return s === "interview" ? `${j.company} invited you to interview` : s === "offer" ? `${j.company} sent you an offer` : `${j.company}'s recruiter wrote to you`;
  };
  return (
    <section className="card mb-6 border-accent p-5 ring-1 ring-accent">
      <h2 className="mb-3 text-lg font-semibold">{jobs.length === 1 ? "A company is waiting on your answer" : `${jobs.length} companies are waiting on your answer`}</h2>
      <ul className="divide-y divide-line">
        {jobs.map((j) => (
          <li key={j._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block font-medium">{what(j)}</span>
              <span className="block text-sm text-ink-2">
                {j.title} · {timeAgo(new Date(j.lastEmail!.at).toISOString())}
              </span>
            </span>
            <Link href={`/jobs/${j._id}#emails`} className="btn btn-primary btn-sm">
              Reply now
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Interviews that already happened this week: one line each to record how it went, plus the thank-you nudge. */
function AfterInterview({ jobs }: { jobs: Doc<"jobs">[] }) {
  if (!jobs.length) return null;
  return (
    <section className="card mb-6 p-5">
      <h2 className="mb-1 text-lg font-semibold">How did your {jobs.length === 1 ? "interview" : "interviews"} go?</h2>
      <p className="mb-3 text-sm text-ink-2">A short thank-you email to the interviewer within a day helps. Then move the job to its next step so your tracker stays right.</p>
      <ul className="divide-y divide-line">
        {jobs.map((j) => (
          <li key={j._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block font-medium">{j.company} interview</span>
              <span className="block text-sm text-ink-2">{j.title}</span>
            </span>
            <Link href={`/jobs/${j._id}`} className="btn btn-sm">
              Update
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `panel` opens in place on a click instead of going to `href`. */
type Todo = { key: string; verb: string; main: string; sub: string; href: string; panel?: React.ReactNode };

/** Steps forward that happened without a click (Gmail moved a job, a recruiter replied), celebrated once each. */
function CelebrateWins({ jobs, now }: { jobs: Doc<"jobs">[]; now: number }) {
  const week = now - 7 * DAY;
  const wins = jobs.flatMap((j) => [
    ...((j.status === "screening" || j.status === "interview" || j.status === "offer") && (j.updatedAt ?? j._creationTime) > week
      ? [{ key: `${j._id}:${j.status}`, message: `${j.company}: ${WIN_WORDS[j.status]}` }]
      : []),
    ...(j.hiringContacts ?? [])
      .filter((c) => c.repliedAt && c.repliedAt > week)
      .map((c) => ({ key: `${j._id}:reply:${c.name}`, message: `${c.name} replied about ${j.title}. Momentum!` })),
  ]);
  useCelebrateNewWins(wins);
  return null;
}

/** Today's goals and how far along you are. Counts start again at 4 AM. */

/** One step of the daily routine, with how many things are in it. */
function Step({ n, title, items, empty, blocked }: { n: number; title: string; items: Todo[]; empty: string; blocked?: boolean }) {
  // Setup prompts ("Connect Gmail", "Score the new jobs") aren't things to do today, so they don't count,
  // and a step that can't start yet isn't "Done".
  // The same number "Show all" uses, so the two never disagree (19 Nov: 18 beside "Show all 19").
  const label = items.length || (blocked ? "" : "Done");
  return (
    // The steps fade up one after another when Today opens.
    <section className="rise mb-8" style={{ animationDelay: `${n * 90}ms` }}>
      <h2 className="mb-3 flex items-baseline gap-3">
        <span className="text-lg font-semibold">{title}</span>
        <span className="text-sm text-ink-3">{label}</span>
      </h2>
      {items.length ? <TodoList items={items} /> : <div className="card p-5 text-sm text-ink-2">{empty}</div>}
    </section>
  );
}

/** Each kind of task in its own colour: lime to apply, cyan for replies, violet to follow up, pink to prepare. */
const VERB_TONE: Record<string, string> = {
  Apply: "text-accent",
  Reply: "text-cyan",
  "Follow up": "text-violet",
  Send: "text-violet",
  Score: "text-pink",
  Prepare: "text-pink",
  Fix: "text-pink",
  Connect: "text-ink-3",
};

function TodoRow({ t, arrow }: { t: Todo; arrow: string }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[11px] font-semibold uppercase tracking-wide ${VERB_TONE[t.verb] ?? "text-accent"}`}>{t.verb}</span>
        <span className="block truncate text-sm font-medium">{t.main}</span>
        {/* Whole on a phone: one cut-off line showed a third of "Recruiter replies…" at 390px (13 Nov). */}
        <span className="block text-xs text-ink-2 md:truncate">{t.sub}</span>
      </span>
      <span className="nudge text-ink-3">{arrow}</span>
    </>
  );
}

const SHOWN = 5;
/** A percentage means something from this many results; below it, "1 of 3" says it honestly. */
const SURE = 5;
/** Splits by role, fit score and habit need this many results before they show a pattern (13 Nov: 9 results showed noise). */
const PATTERNS = 10;

/** The first five things to do, the rest one tap away: more read as a wall (13 Nov). */
function TodoList({ items }: { items: Todo[] }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div className="card p-2">
      <ul className="divide-y divide-line">
        {shown.map((t) => (
          <li key={t.key}>
            {t.panel ? (
              <>
                <button type="button" onClick={() => setOpen(open === t.key ? null : t.key)} className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-soft" aria-expanded={open === t.key}>
                  <TodoRow t={t} arrow={open === t.key ? "▴" : "▾"} />
                </button>
                {open === t.key && (
                  <div className="px-3 pb-3">
                    {t.panel}
                    <Link href={t.href} className="mt-2 inline-block text-xs text-ink-3 underline hover:text-ink">
                      Open the job
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <Link href={t.href} className="group flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-soft">
                <TodoRow t={t} arrow="→" />
              </Link>
            )}
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <button type="button" className="px-3 py-2 text-sm text-ink-3 underline hover:text-ink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < DAY_STARTS_AT ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Which roles and which fit scores actually get replies, from every application with a known result. */
const SOURCE_LABELS: Record<string, string> = {
  careers: "Company careers boards",
  dreamwork: "Job boards",
  jsearch: "Job boards",
  adzuna: "Job boards",
  himalayas: "Job boards",
  hn: "Job boards",
  email: "From your email",
  linkedin: "LinkedIn jobs",
  link: "Added by you",
  pasted: "Added by you",
  post: "LinkedIn posts",
};

type Lessons = NonNullable<NonNullable<FunctionReturnType<typeof api.users.me>>["lessons"]>;

function WhatsWorking({ jobs, tracks, lessons }: { jobs: Doc<"jobs">[]; tracks: Doc<"tracks">[]; lessons: Lessons | null }) {
  const [now] = useState(() => Date.now());
  const { total, byTrack, byBand } = tallyOutcomes(jobs, jobTrackKey, now);
  if (!total) return null;
  const rate = (t: Tally) => Math.round((t.responses / t.total) * 100);
  const line = (label: string, t: Tally | undefined, color?: string) =>
    t && (
      <li key={label} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
          {label}
        </span>
        <span className="tabular-nums text-ink-2">
          {t.responses} of {t.total} replied {t.total >= SURE && <b className="ml-1 text-ink">{rate(t)}%</b>}
        </span>
      </li>
    );
  // The habits behind replies: asking for a referral, applying early, and where the job came from.
  const referral = tallyBy(jobs, (j) => (j.outreach.some((o) => o.status !== "draft") ? "With a referral ask" : "Without one"), now);
  const speed = tallyBy(
    jobs,
    (j) => {
      const posted = j.postedAt ? new Date(j.postedAt).getTime() : NaN;
      if (!j.appliedAt || !Number.isFinite(posted)) return null;
      return j.appliedAt - posted <= 3 * DAY ? "Applied within 3 days of posting" : "Applied later";
    },
    now,
  );
  const anyway = jobs.some((j) => j.wroteAnyway) ? tallyBy(jobs, (j) => (j.wroteAnyway ? "Wrote it anyway" : "Above the line"), now) : new Map<string, Tally>();
  const source = tallyBy(jobs, (j) => SOURCE_LABELS[j.source] ?? null, now);
  const habits = [...referral, ...speed, ...anyway];
  // Messages you marked sent, and whether a reply came to the first message or to a follow-up.
  const threads = jobs.flatMap((j) => [
    ...j.outreach.map((o) => ({ kind: "Referral asks", sentAt: o.status === "draft" ? undefined : (o.sentAt ?? 1), replied: o.status === "replied" || o.status === "referred", followUps: o.followUps })),
    ...(j.hiringContacts ?? []).map((c) => ({ kind: c.channel === "email" ? "Emails to hiring managers" : "LinkedIn notes to hiring managers", sentAt: c.sentAt, replied: !!c.repliedAt, followUps: c.followUps })),
  ]);
  const kinds = ["Referral asks", "LinkedIn notes to hiring managers", "Emails to hiring managers"].map((k) => {
    const t = threads.filter((x) => x.kind === k && x.sentAt);
    return [k, { total: t.length, responses: t.filter((x) => x.replied).length }] as const;
  });
  const timing = replyTiming(threads);
  // Asking for a call against just putting yourself on their radar, to see which your readers answer.
  const contacted = jobs.flatMap((j) => (j.hiringContacts ?? []).filter((c) => c.sentAt && c.asked !== undefined));
  const askSplit = (["With an ask", "On your radar, no ask"] as const).map((label) => {
    const t = contacted.filter((c) => c.asked === (label === "With an ask"));
    return [label, { total: t.length, responses: t.filter((c) => c.repliedAt).length }] as const;
  });
  return (
    <section id="whats-working" className="mb-12 scroll-mt-6">
      <h2 className="display mb-1 text-3xl">What&apos;s working</h2>
      <p className="mb-4 text-sm text-ink-3">
        From {total} application{total > 1 ? "s" : ""} with a result: a reply, a no, or silence after {SILENT_AFTER / 86_400_000} days.{" "}
        {total >= 3 ? "Fit scores now lean toward what gets replies." : "After three results, fit scores start learning from them too."}
      </p>
      <LessonsCard jobs={jobs} lessons={lessons} now={now} />
      {total >= PATTERNS ? (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-medium">By role</h3>
          <ul className="divide-y divide-line">{tracks.map((t) => line(t.name, byTrack.get(t.key), t.color))}</ul>
        </div>
        <div className="card p-5">
          <h3 className="font-medium">By fit score</h3>
          <ul className="divide-y divide-line">{BANDS.map((b) => line(b.label, byBand.get(b.key)))}</ul>
        </div>
        <div className="card p-5">
          <h3 className="font-medium">By how you applied</h3>
          <ul className="divide-y divide-line">{habits.map(([label, t]) => line(label, t))}</ul>
        </div>
        <div className="card p-5">
          <h3 className="font-medium">By message</h3>
          <ul className="divide-y divide-line">{[...kinds, ...askSplit].filter(([, t]) => t.total).map(([label, t]) => line(label, t))}</ul>
          {timing.toFirst + timing.toFollowUp > 0 && (
            <p className="mt-2 text-xs text-ink-3">
              {timing.toFollowUp} of {timing.toFirst + timing.toFollowUp} replies came after a follow-up.
            </p>
          )}
        </div>
        <div className="card p-5">
          <h3 className="font-medium">By where you found it</h3>
          <ul className="divide-y divide-line">{[...source].map(([label, t]) => line(label, t))}</ul>
        </div>
      </div>
      ) : (
        <p className="text-sm text-ink-3">Patterns by role, fit score and habit show after {PATTERNS} results. You have {total}.</p>
      )}
    </section>
  );
}

const KIND_WORDS = { cv: "Show it on your CV", skill: "Build it", targeting: "Aim differently" };

/** The gaps that keep coming up in your noes, read by AI once there are enough of them. */
function LessonsCard({ jobs, lessons, now }: { jobs: Doc<"jobs">[]; lessons: Lessons | null; now: number }) {
  const learn = useAction(api.agent.learnFromNoes);
  const noes = countNoes(jobs, now);
  if (noes < 3 && !lessons) {
    return <p className="card mb-4 p-5 text-sm text-ink-2">After three noes or silences, JobPipe reads them together and names the gap that keeps costing you. {noes} so far.</p>;
  }
  const fresh = lessons && noes - lessons.basedOn < 3;
  return (
    <div className="card mb-4 border-accent p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">What keeps costing you</h3>
        <ActionButton run={async () => void (await learn())} pending="Reading your noes…" variant={fresh ? "ghost" : "primary"} size="sm">
          {lessons ? (fresh ? "Read again" : `Read the ${noes - lessons.basedOn} new ones`) : `Read my ${noes} noes`}
        </ActionButton>
      </div>
      {lessons ? (
        <>
          <p className="mt-2 text-sm">{lessons.summary}</p>
          <ol className="mt-3 space-y-3 text-sm">
            {lessons.items.map((i) => (
              <li key={i.gap}>
                <div className="font-medium">
                  {i.gap} <span className="text-xs font-normal text-ink-3">· in {i.seen} applications · {KIND_WORDS[i.kind]}</span>
                </div>
                <p className="text-ink-2">{i.fix}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-ink-3">From {lessons.basedOn} noes and silences, {timeAgo(lessons.at)}.</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-2">You have {noes} noes and silences. One read finds the gaps that come up again and again, and what to do about each.</p>
      )}
    </div>
  );
}

/** The morning search-and-score switch, and what the last run found. */
function Autopilot({ on, last, now, found, strongNow }: { now: number; on: boolean; found: number; strongNow: number; last: { at: number; added: number; scored: number; strong: number; funded?: number; failed?: string[] } | null }) {
  const setAutopilot = useMutation(api.users.setAutopilot);
  // Off: a clear card, since nothing arrives without it.
  if (!on) {
    return (
      <div className="card mt-4 flex flex-wrap items-center gap-3 p-4 text-sm">
        <p className="flex-1 text-ink-2">Morning search is off. Turn it on and every morning at 8 we search all your roles and score what&apos;s new.</p>
        <button className="btn btn-primary btn-sm" onClick={() => void setAutopilot({ on: true })}>
          Turn on
        </button>
      </div>
    );
  }
  // On: one line under the greeting, what this morning brought, before the to-dos (13 Nov: it sat at the bottom).
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
      <span>
        {last
          ? // Strong fits counted across every open job, not just this morning's (19 Nov: "0 strong fits" beside an 84% card).
            `${dayStart(now) <= last.at ? "This morning" : `Last search ${timeAgo(new Date(last.at).toISOString())}`}: ${last.added} new ${last.added === 1 ? "job" : "jobs"}. ${strongNow ? `${strongNow} strong ${strongNow === 1 ? "fit" : "fits"} (75+) open to apply to.` : "No strong fits (75+) open right now."}`
          : // Signing up runs a first search, so a new person already has jobs (14 Nov: this said "runs tomorrow" beside 75 found).
            `${found ? `Your first search found ${found} ${found === 1 ? "job" : "jobs"}; the likeliest are below. The next search runs` : "Your first search runs"} ${beforeEightInIndia() ? "today" : "tomorrow"} at 8 in the morning.`}
      </span>
      {last && strongNow > 0 && (
        <Link href="/jobs?fit=strong" className="text-accent underline">
          See strong fits
        </Link>
      )}
    </p>
  );
}

/** Companies that raised money in the last two weeks: worth a note to the founder, role or no role. */
function JustRaised({ prospects }: { prospects: Doc<"prospects">[] }) {
  const fresh = prospects
    .filter((p) => p.source === "funded" && p.status === "new" && msSince(p._creationTime) < 14 * DAY)
    .sort((a, b) => (b.fit?.score ?? 0) - (a.fit?.score ?? 0))
    .slice(0, 5);
  if (!fresh.length) return null;
  return (
    <section className="card mb-10 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Just raised money</h2>
        <Link href="/companies" className="text-sm text-ink-3 hover:text-ink">
          All companies
        </Link>
      </div>
      <p className="mb-3 text-sm text-ink-2">Fresh funding means hiring soon. Reach the founder or sales leader now, before a role is posted.</p>
      <ul className="divide-y divide-line">
        {fresh.map((p) => (
          <li key={p._id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="font-medium">
                {p.name} <span className="text-sm font-normal text-ink-2">{p.oneLiner}</span>
              </div>
              <div className="text-xs text-ink-3">{p.funding}</div>
              {p.fit && <div className="mt-1 text-sm text-ink-2">Angle: {p.fit.angle}</div>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ScorePill score={p.fit?.score} />
              <Link href={`/companies?open=${p._id}`} className="text-xs font-medium text-accent hover:underline">
                Reach out →
              </Link>
              <a className="text-xs text-ink-3 underline hover:text-ink" href={linkedInPeopleSearch(p.name, "Founder")} target="_blank" rel="noreferrer">
                Find founders ↗
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The first-steps line once jobs are in: right after sign-up the best few are being scored by themselves. */
function firstFound(jobs: Doc<"jobs">[], searching: boolean) {
  const scored = jobs.filter((j) => j.scores?.length);
  const good = scored.filter((j) => (bestScore(j)?.score ?? 0) >= SKIP_BELOW).length;
  if (good) return `${jobs.length} found, ${good} worth applying to. Open Jobs to see why each one fits.`;
  if (scored.length)
    return `${jobs.length} found. The AI scored the ${scored.length} likeliest and none fits well yet: add another role under Profile → Roles, or check back after tomorrow's search.`;
  return searching ? `${jobs.length} found. Scoring the best ones now, about a minute.` : `${jobs.length} found. Score them to see which fit.`;
}
