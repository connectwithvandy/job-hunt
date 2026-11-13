"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { companyKey, linkedInPeopleSearch } from "../../convex/lib/company";
import { nextFollowUp, REFERRAL_FOLLOW_UP_AFTER, replyTiming } from "../../convex/lib/followups";
import { SKIP_BELOW } from "../../convex/lib/posting";
import { openTo, readPlace } from "../../convex/lib/sources";
import { BANDS, SILENT_AFTER, countNoes, tallyBy, tallyOutcomes, type Tally } from "../../convex/lib/outcomes";
import type { Doc } from "../../convex/_generated/dataModel";
import { useCelebrateNewWins, WIN_WORDS } from "@/components/Celebrate";
import { DAY_STARTS_AT, likelyScore, ScorePill, bestScore, dayStart, jobTrackKey, timeAgo } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { SetupGuide } from "@/components/SetupGuide";
import { PlacesPopup } from "@/components/PlacesPopup";
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
  const prospects = useQuery(api.prospects.list);
  const stories = useQuery(api.stories.list);
  const warm = useQuery(api.contacts.warmCompanies);
  const interviews = useQuery(api.inbox.upcoming);
  const [now] = useState(() => Date.now());
  const markSeen = useMutation(api.users.markSeen);
  useEffect(() => void markSeen().catch(() => {}), [markSeen]);
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
  const strong = jobs
    // A closed posting or one that rules you out isn't worth the evening.
    .filter((j) => j.status === "new" && (bestScore(j)?.score ?? 0) >= 75 && j.liveCheck?.state !== "closed" && !j.brief?.blocker && nearby(j))
    .sort((a, b) => bestScore(b)!.score - bestScore(a)!.score)
    .slice(0, 5);
  // Unanswered for a week at most: after that it's stale, and the job's follow-ups take over.
  const replies = jobs.filter((j) => j.lastEmail && !j.lastEmail.repliedAt && msSince(j.lastEmail.at) < 7 * DAY && ["screening", "interview", "offer"].includes(j.status));
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
    ...replies.map((j) => ({ key: `r${j._id}`, verb: "Reply", main: `${j.title} at ${j.company}`, sub: `${STAGE_WORDS[j.status] ?? "Email"} ${timeAgo(new Date(j.lastEmail!.at).toISOString())}. Draft your answer`, href: `/jobs/${j._id}#emails` })),
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
      ? [{ key: "gmail", verb: "Connect", main: me.inboxAt ? "Gmail stopped checking" : "Connect Gmail so replies show up here", sub: "Recruiter replies and interview invites land here by themselves. Set it up once on the Application tracker page.", href: "/tracker" }]
      : []),
    ...(interviewing.length && stories?.length === 0
      ? [{ key: "stories", verb: "Prepare", main: "Your proof of work", sub: `${interviewing.length} interview${interviewing.length > 1 ? "s" : ""} coming. Six examples cover most questions.`, href: "/stories" }]
      : []),
  ];

  // 2. Jobs found in the last 24 hours that fit, best first: applying early gets more replies.
  // AI-scored jobs rank above first guesses, which run high.
  const fit = (j: Doc<"jobs">) => bestScore(j)?.score ?? j.quickFit ?? 0;
  const fresh = jobs
    .filter((j) => j.status === "new" && now - j._creationTime < DAY && fit(j) >= SKIP_BELOW && j.liveCheck?.state !== "closed" && !j.brief?.blocker && nearby(j) && recent(j))
    .sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || fit(b) - fit(a));
  const freshIds = new Set(fresh.map((j) => j._id));
  const freshScored = fresh.filter((j) => j.scores?.length);
  const freshGuessed = fresh.filter((j) => !j.scores?.length);
  const freshUnscored = freshGuessed.length;
  // Older strong fits fill in when there's little new that the AI has scored.
  const older = strong.filter((j) => !freshIds.has(j._id)).slice(0, Math.max(0, APPLIES_A_DAY - freshScored.length));
  const applyNew = (list: Doc<"jobs">[]) =>
    list.map((j) => ({
      key: `n${j._id}`,
      verb: "Apply",
      main: `${j.title} at ${j.company}`,
      // Found today isn't posted today: a role up for weeks may be filled.
      sub: [j.postedAt ? `Posted ${timeAgo(j.postedAt)}` : `Found ${timeAgo(new Date(j._creationTime).toISOString())}`, bestScore(j) ? `Fit ${bestScore(j)!.score}` : `First guess ~${likelyScore(j.quickFit ?? 0)}, not scored yet`].join(" · "),
      href: `/jobs/${j._id}`,
    }));
  const apply: Todo[] = [
    ...emptyRoles.map((t) => ({ key: `e${t._id}`, verb: "Fix", main: `${t.name} finds no jobs`, sub: "Its job titles may be too narrow. Add the titles companies actually use.", href: "/tracks" })),
    // The free first guess is rough, so scoring comes before applying.
    ...(freshUnscored ? [{ key: "scorefresh", verb: "Score", main: `Score the ${freshUnscored} new ${freshUnscored === 1 ? "job" : "jobs"} first`, sub: "The first guess only reads titles and words; the AI score reads the whole job", href: "/jobs?sort=added" }] : []),
    // AI-scored jobs first, new then older; first guesses after them, never ahead of a real score.
    ...applyNew(freshScored.slice(0, 8)),
    ...older.map((j) => ({ key: `s${j._id}`, verb: "Apply", main: `${j.title} at ${j.company}`, sub: `Fit ${bestScore(j)!.score}, found ${timeAgo(new Date(j._creationTime).toISOString())}`, href: `/jobs/${j._id}` })),
    ...applyNew(freshGuessed.slice(0, Math.max(0, 8 - freshScored.length))),
    ...(unscored.length > freshUnscored ? [{ key: "score", verb: "Score", main: `${unscored.length - freshUnscored} older ${unscored.length - freshUnscored === 1 ? "job" : "jobs"} not scored yet`, sub: "See which ones are worth your time", href: "/jobs?sort=added" }] : []),
  ];

  // 3. Messages and applications with no answer yet.
  const chase: Todo[] = [
    ...drafts.map(({ j, o }) => ({ key: `d${j._id}${o.contactId}`, verb: "Send", main: `Referral note to ${o.name}`, sub: `Drafted, not sent yet · ${j.title} at ${j.company}`, href: `/jobs/${j._id}` })),
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
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-sm text-ink-3">{new Date(dayStart(now)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="display mt-1 text-4xl uppercase md:text-5xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <Autopilot on={me.autopilot} last={me.lastAutopilot} now={now} />
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
          <Link href="/network" className="btn btn-primary btn-sm">
            Refresh
          </Link>
        </section>
      )}

      <CelebrateWins jobs={jobs} now={now} />
      <TodayProgress
        items={[
          { label: "Companies asked today", done: companiesAskedToday, goal: COMPANIES_A_DAY, total: askedTotal },
          { label: "Applied today", done: appliedToday, goal: APPLIES_A_DAY, total: appliedTotal, bar: "bg-cyan" },
          { label: "Follow-ups due", done: 0, goal: chase.length, left: true },
        ]}
      />

      {!!interviews?.length && (
        <section className="card mb-8 p-6">
          <h2 className="display mb-4 text-2xl">Interviews coming up</h2>
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

      <Step n={1} title={answer.some((t) => t.verb === "Reply" || t.verb === "Apply") ? "Answer people who wrote back" : "Replies and interviews"} items={answer} empty="No one waiting on a reply from you." />
      <Step n={2} title="Apply to new jobs" items={apply} empty="Nothing new that fits in the last 24 hours. Run a search on the Jobs page." />
      <Step n={3} title="Follow-ups to do today" items={chase} empty="No follow-ups due today." />
      <Step
        n={4}
        title="Ask for referrals"
        items={reach}
        blocked={!me.contactsCount}
        empty={me.contactsCount ? "You've asked at every company on your top 50 list." : "Load your LinkedIn connections under People to see who you know at each company."}
      />


      {/* Closed unless opened: Today is the to-do list. New jobs are step 2, so they aren't listed again here (13 Nov). */}
      <Pipeline jobs={jobs} tracks={me.tracks} />

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">
          See more: what&apos;s working{learn ? ` (${noes} noes and silences to learn from)` : ""}, newly funded companies
        </summary>
        <div className="mt-6">
          <WhatsWorking jobs={jobs} tracks={me.tracks} lessons={me.lessons} />
          <JustRaised prospects={prospects ?? []} />
        </div>
      </details>

      <p className="mt-16 text-xs text-ink-3">
        {me.email} · {me.contactsCount.toLocaleString()} connections loaded
      </p>
    </div>
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
function TodayProgress({ items }: { items: { label: string; done: number; goal: number; left?: boolean; total?: number; bar?: string }[] }) {
  return (
    <section className="card mb-8 grid grid-cols-3 gap-4 p-5">
      {items.map((i) => (
        <div key={i.label}>
          <div className="text-xs text-ink-3">{i.label}</div>
          <div className="display mt-1 text-3xl leading-none tabular-nums">
            {i.left ? i.goal : i.done}
            {!i.left && <span className="text-lg text-ink-3"> / {i.goal}</span>}
          </div>
          {!i.left && (
            <div className="mt-2 h-1 rounded-full bg-soft">
              <div className={`fill h-1 rounded-full ${i.bar ?? "bg-accent"}`} style={{ width: `${Math.min(100, (i.done / Math.max(1, i.goal)) * 100)}%` }} />
            </div>
          )}
          {i.total !== undefined && <div className="mt-2 text-xs text-ink-2">{i.total} in total</div>}
          {i.left && <div className="mt-2 text-xs text-ink-2">{i.goal ? "Clear these first" : "All caught up"}</div>}
        </div>
      ))}
    </section>
  );
}

const STAGE_WORDS: Record<string, string> = { screening: "Recruiter wrote", interview: "Interview invite", offer: "Offer" };

/** One step of the daily routine, with how many things are in it. */
function Step({ n, title, items, empty, blocked }: { n: number; title: string; items: Todo[]; empty: string; blocked?: boolean }) {
  // Setup prompts ("Connect Gmail", "Score the new jobs") aren't things to do today, so they don't count,
  // and a step that can't start yet isn't "Done".
  const real = items.filter((i) => i.verb !== "Connect" && i.verb !== "Score").length;
  const label = real || (items.length || blocked ? "" : "Done");
  return (
    // The steps fade up one after another when Today opens.
    <section className="rise mb-8" style={{ animationDelay: `${n * 90}ms` }}>
      <h2 className="mb-3 flex items-baseline gap-3">
        <span className="display text-3xl">
          {n}. {title}
        </span>
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
      <span className={`w-20 shrink-0 text-xs font-medium uppercase tracking-wide ${VERB_TONE[t.verb] ?? "text-accent"}`}>{t.verb}</span>
      <span className="min-w-0 flex-1">
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

/** One role's search, or all of them together: what's worth applying to, then each step after it. */
type Funnel = { good: number; applied: number; asked: number; heard: number; tried: number; interviews: number };

const APPLIED = new Set(["applied", "screening", "interview", "offer", "rejected"]);

function funnelOf(jobs: Doc<"jobs">[]): Funnel {
  const live = jobs.filter((j) => j.status !== "dismissed");
  // Worth a look: AI 60+. Not every saved job ("294 in play" said nothing), and not first guesses: two in three
  // guesses of 70+ were scored under 60 by the AI (13 Nov, 1,533 jobs).
  const good = live.filter((j) => (j.status === "new" || j.status === "applying") && (bestScore(j)?.score ?? -1) >= 60);
  // Messages you sent: referral asks and notes to hiring managers.
  const messaged = (j: Doc<"jobs">) => j.outreach.some((o) => o.status !== "draft") || (j.hiringContacts ?? []).some((c) => c.sentAt);
  // Heard back, per job: someone answered your message, or the company moved you on or said no.
  // Counting only message replies showed "0 replies" beside an interview (13 Nov).
  const heard = (j: Doc<"jobs">) =>
    ["screening", "interview", "offer", "rejected"].includes(j.status) ||
    j.outreach.some((o) => o.status === "replied" || o.status === "referred") ||
    (j.hiringContacts ?? []).some((c) => c.repliedAt);
  const tried = live.filter((j) => APPLIED.has(j.status) || messaged(j));
  return {
    good: good.length,
    applied: live.filter((j) => APPLIED.has(j.status)).length,
    asked: live.reduce((n, j) => n + j.outreach.filter((o) => o.status !== "draft").length + (j.hiringContacts ?? []).filter((c) => c.sentAt).length, 0),
    heard: tried.filter(heard).length,
    tried: tried.length,
    interviews: live.filter((j) => j.status === "interview" || j.status === "offer").length,
  };
}

/** Of the jobs you applied to or messaged about, how many answered: "1 of 3" until 5 make a rate meaningful. */
function replyNote(f: Funnel) {
  if (!f.tried) return "Nothing sent yet";
  return f.tried >= SURE ? `Heard back on ${Math.round((f.heard / f.tried) * 100)}%` : `Heard back on ${f.heard} of ${f.tried}`;
}

const STAGES: { key: keyof Funnel; label: string }[] = [
  { key: "good", label: "Good fits" },
  { key: "applied", label: "Applied" },
  { key: "asked", label: "Messages sent" },
  { key: "heard", label: "Heard back" },
  { key: "interviews", label: "Interviews" },
];

/** Your whole search at a glance, then role by role, so you can see which role is moving and which is stuck. */
function Pipeline({ jobs, tracks }: { jobs: Doc<"jobs">[]; tracks: Doc<"tracks">[] }) {
  const active = tracks.filter((t) => t.status === "active");
  const total = funnelOf(jobs);
  if (!active.length) return null;
  const rows = active.map((t) => ({ t, f: funnelOf(jobs.filter((j) => jobTrackKey(j, tracks) === t.key)) }));
  return (
    <section className="card mt-2 mb-8 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-2xl">Your search so far</h2>
        <span className="text-sm text-ink-2">{replyNote(total)}</span>
      </div>
      <ol className="mt-4 grid grid-cols-5 gap-1 text-center">
        {STAGES.map((s, i) => (
          <li key={s.key} className={`rounded-lg px-1 py-3 ${i === 0 ? "bg-soft" : ""}`}>
            <div className="display text-2xl tabular-nums sm:text-3xl">{total[s.key]}</div>
            <div className="mt-1 text-[11px] leading-tight text-ink-3 sm:text-xs">{s.label}</div>
          </li>
        ))}
      </ol>
      {rows.length > 1 && (
        <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
          {rows.map(({ t, f }) => (
            <li key={t._id}>
              <Link href={`/jobs?track=${t.key}`} className="block py-3 hover:bg-soft sm:-mx-2 sm:px-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{f.interviews ? `${f.interviews} in interviews` : replyNote(f)}</span>
                </div>
                <div className="mt-1 text-xs tabular-nums text-ink-2">
                  {f.good + f.applied === 0 ? (
                    <span className="text-pink">Finds no jobs yet: widen its titles on Setup</span>
                  ) : (
                    `${f.good} good fits · ${f.applied} applied · ${f.asked} messages · heard back on ${f.heard}`
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The morning search-and-score switch, and what the last run found. */
function Autopilot({ on, last, now }: { now: number; on: boolean; last: { at: number; added: number; scored: number; strong: number; funded?: number; failed?: string[] } | null }) {
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
          ? `${dayStart(now) <= last.at ? "This morning" : `Last search ${timeAgo(new Date(last.at).toISOString())}`}: ${last.added} new ${last.added === 1 ? "job" : "jobs"}, ${last.scored} scored, ${last.strong} strong ${last.strong === 1 ? "fit" : "fits"} (75+).`
          : `Your first search runs ${beforeEightInIndia() ? "today" : "tomorrow"} at 8 in the morning.`}
      </span>
      {last && last.strong > 0 && (
        <Link href="/jobs?fit=strong" className="text-accent underline">
          See strong fits
        </Link>
      )}
      <button className="text-xs text-ink-3 underline hover:text-ink" onClick={() => void setAutopilot({ on: false })}>
        Turn off morning search
      </button>
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
        <h2 className="display text-2xl">Just raised money</h2>
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
    return `${jobs.length} found. The AI scored the ${scored.length} likeliest and none fits well yet: add another role on Setup, or check back after tomorrow's search.`;
  return searching ? `${jobs.length} found. Scoring the best ones now, about a minute.` : `${jobs.length} found. Score them to see which fit.`;
}
