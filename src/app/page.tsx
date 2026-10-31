"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { companyKey, linkedInPeopleSearch } from "../../convex/lib/company";
import { nextFollowUp, replyTiming } from "../../convex/lib/followups";
import { SKIP_BELOW } from "../../convex/lib/posting";
import { BANDS, SILENT_AFTER, countNoes, tallyBy, tallyOutcomes, type Tally } from "../../convex/lib/outcomes";
import type { Doc } from "../../convex/_generated/dataModel";
import { CompanyMark, QuickFitPill, ScorePill, TrackTag, bestScore, jobTrackKey, timeAgo } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { ActionButton } from "@/components/ui";

const DAY = 86_400_000;

/** A steady day's outreach: new companies asked for a referral, and applications sent. */
const COMPANIES_A_DAY = 10;
const APPLIES_A_DAY = 5;

/** Jobs still worth chasing: not closed, not set aside. */
const stillChasing = (status: string) => status !== "rejected" && status !== "dismissed" && status !== "offer";
const LIVE = new Set(["applying", "applied", "screening", "interview", "offer"]);

function msSince(when: number) {
  return Date.now() - when;
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
  const [searching] = useState(startedFirstSearch);
  const jobs = useQuery(api.jobs.list);
  const prospects = useQuery(api.prospects.list);
  const stories = useQuery(api.stories.list);
  const warm = useQuery(api.contacts.warmCompanies);
  const interviews = useQuery(api.inbox.upcoming);
  const [now] = useState(() => Date.now());
  const markSeen = useMutation(api.users.markSeen);
  useEffect(() => void markSeen().catch(() => {}), [markSeen]);
  if (!me || !jobs) return <Loading />;
  const firstName = me.resume?.name.split(" ")[0];

  const stats = me.tracks.map((t) => {
    const mine = jobs.filter((j) => jobTrackKey(j) === t.key && j.status !== "dismissed");
    const applied = mine.filter((j) => LIVE.has(j.status) && j.status !== "applying");
    const asks = mine.flatMap((j) => j.outreach.filter((o) => o.status !== "draft"));
    const replies = asks.filter((o) => o.status === "replied" || o.status === "referred");
    const interviews = mine.filter((j) => j.status === "interview" || j.status === "offer");
    return { t, inPlay: mine.length, applied: applied.length, asks: asks.length, replies: replies.length, interviews: interviews.length };
  });

  const unscored = jobs.filter((j) => j.status === "new" && !j.scores?.length);
  const strong = jobs
    // A closed posting or one that rules you out isn't worth the evening.
    .filter((j) => j.status === "new" && (bestScore(j)?.score ?? 0) >= 75 && j.liveCheck?.state !== "closed" && !j.brief?.blocker)
    .sort((a, b) => bestScore(b)!.score - bestScore(a)!.score)
    .slice(0, 5);
  const replies = jobs.filter((j) => j.lastEmail && msSince(j.lastEmail.at) < 3 * DAY && ["screening", "interview", "offer"].includes(j.status));
  const drafts = jobs.flatMap((j) => j.outreach.filter((o) => o.status === "draft").map((o) => ({ j, o })));
  // Follow-ups that are due: referral asks and messages to hiring managers that got no reply in a week.
  const followUps = jobs.flatMap((j) => [
    ...j.outreach.map((o) => ({ j, name: o.name, n: nextFollowUp({ sentAt: o.status === "sent" ? o.sentAt : undefined, replied: false, followUps: o.followUps }) })),
    ...(j.hiringContacts ?? []).map((c) => ({ j, name: c.name, n: nextFollowUp({ sentAt: c.sentAt, replied: !!c.repliedAt, followUps: c.followUps }) })),
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

  // What you've done since midnight, so the day starts fresh each morning.
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const sentToday = (at?: number) => !!at && at >= midnight;
  const companiesAskedToday = new Set(
    jobs.filter((j) => j.outreach.some((o) => sentToday(o.sentAt)) || (j.hiringContacts ?? []).some((c) => sentToday(c.sentAt))).map((j) => companyKey(j.company)),
  ).size;
  const appliedToday = jobs.filter((j) => sentToday(j.appliedAt)).length;
  // The next companies from your top 50 that you haven't asked anyone at yet: a few a day, after the routine.
  const askedAt = new Set(jobs.filter((j) => j.outreach.length || (j.hiringContacts ?? []).some((c) => c.sentAt)).map((j) => companyKey(j.company)));
  const toAsk = (warm ?? []).map((c, rank) => ({ c, rank })).filter(({ c }) => !askedAt.has(c.key)).slice(0, Math.max(0, Math.min(3, COMPANIES_A_DAY - companiesAskedToday)));

  // 1. People who wrote back: companies by email, connections who answered a referral ask, hiring managers.
  const open = (j: Doc<"jobs">) => j.status === "new" || j.status === "applying";
  const answer: Todo[] = [
    ...replies.map((j) => ({ key: `r${j._id}`, verb: "Reply", main: `${j.title} at ${j.company}`, sub: `${STAGE_WORDS[j.status] ?? "Email"} ${timeAgo(new Date(j.lastEmail!.at).toISOString())}`, href: `/jobs/${j._id}` })),
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
    ...(interviewing.length && stories?.length === 0
      ? [{ key: "stories", verb: "Prepare", main: "Your interview stories", sub: `${interviewing.length} interview${interviewing.length > 1 ? "s" : ""} coming. Six stories cover most questions.`, href: "/stories" }]
      : []),
  ];

  // 2. Jobs found in the last 24 hours that fit, best first: applying early gets more replies.
  // AI-scored jobs rank above first guesses, which run high.
  const fit = (j: Doc<"jobs">) => bestScore(j)?.score ?? j.quickFit ?? 0;
  const fresh = jobs
    .filter((j) => j.status === "new" && now - j._creationTime < DAY && fit(j) >= SKIP_BELOW && j.liveCheck?.state !== "closed" && !j.brief?.blocker)
    .sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || fit(b) - fit(a));
  const freshIds = new Set(fresh.map((j) => j._id));
  const freshUnscored = fresh.filter((j) => !j.scores?.length).length;
  const apply: Todo[] = [
    // The free first guess is rough, so scoring comes before applying.
    ...(freshUnscored ? [{ key: "scorefresh", verb: "Score", main: `Score the ${freshUnscored} new ${freshUnscored === 1 ? "job" : "jobs"} first`, sub: "The first guess only reads titles and words; the AI score reads the whole job", href: "/jobs?sort=added" }] : []),
    ...fresh.slice(0, 8).map((j) => ({
      key: `n${j._id}`,
      verb: "Apply",
      main: `${j.title} at ${j.company}`,
      // Found today isn't posted today: a role up for weeks may be filled.
      sub: [j.postedAt ? `Posted ${timeAgo(j.postedAt)}` : `Found ${timeAgo(new Date(j._creationTime).toISOString())}`, bestScore(j) ? `Fit ${bestScore(j)!.score}` : `First guess ${j.quickFit ?? 0}, not scored yet`].join(" · "),
      href: `/jobs/${j._id}`,
    })),
    // Older strong fits fill in when there's little new.
    ...strong.filter((j) => !freshIds.has(j._id)).slice(0, Math.max(0, APPLIES_A_DAY - fresh.length)).map((j) => ({ key: `s${j._id}`, verb: "Apply", main: `${j.title} at ${j.company}`, sub: `Fit ${bestScore(j)!.score}, found ${timeAgo(new Date(j._creationTime).toISOString())}`, href: `/jobs/${j._id}` })),
    ...(unscored.length > freshUnscored ? [{ key: "score", verb: "Score", main: `${unscored.length - freshUnscored} older ${unscored.length - freshUnscored === 1 ? "job" : "jobs"} not scored yet`, sub: "See which ones are worth your time", href: "/jobs?sort=added" }] : []),
  ];

  // 3. Messages and applications with no answer yet.
  const chase: Todo[] = [
    ...drafts.map(({ j, o }) => ({ key: `d${j._id}${o.contactId}`, verb: "Send", main: `Referral note to ${o.name}`, sub: `Drafted, not sent yet · ${j.title} at ${j.company}`, href: `/jobs/${j._id}` })),
    ...followUps.map(({ j, name, n }) => ({ key: `f${j._id}${name}${n!.n}`, verb: "Follow up", main: name, sub: `Follow-up ${n!.n} about ${j.title} at ${j.company}, no reply yet`, href: `/jobs/${j._id}` })),
    ...quiet.map((j) => ({ key: `q${j._id}`, verb: "Follow up", main: `${j.title} at ${j.company}`, sub: `Applied ${timeAgo(j.appliedAt)}, no answer yet`, href: `/jobs/${j._id}` })),
  ];

  // 4. New companies to open up, once the rest is done.
  const reach: Todo[] = [
    ...toAsk.map(({ c, rank }) => ({
      key: `a${c.key}`,
      verb: "Ask",
      main: `${c.company} · #${rank + 1} on your top 50`,
      sub: [`You know ${c.peopleCount}`, c.fitting > 1 ? `${c.fitting} roles fit` : null, c.funding ? "just raised" : null, c.jobs[0]?.title].filter(Boolean).join(" · "),
      href: `/jobs/${c.jobs[0]._id}`,
    })),
    ...raised.map((p) => ({ key: `r${p._id}`, verb: "Reach out", main: p.name, sub: `Just raised: ${p.funding ?? "new funding"}`, href: `/companies?open=${p._id}` })),
    ...(learn ? [{ key: "learn", verb: "Learn", main: "What keeps costing you", sub: `${noes} noes and silences so far. See the pattern.`, href: "/#whats-working" }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-sm text-ink-3">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="display mt-1 text-4xl uppercase md:text-5xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      {(me.contactsCount === 0 || jobs.length === 0) && (
        <section className="card mb-8 p-6">
          <h2 className="display mb-4 text-2xl">Next steps</h2>
          <ol className="grid gap-3 md:grid-cols-2">
            <Setup done={jobs.length > 0} n={1} href="/jobs" title="Find your first jobs" text={jobs.length ? `${jobs.length} found. Score them to see which fit.` : searching ? "Finding your first jobs now. They'll appear here in a minute or two." : "Search on the Jobs page, or paste a job description."} />
            <Setup done={me.contactsCount > 0} n={2} href="/network" title="Load your LinkedIn connections" text="So every job shows who you know there." />
          </ol>
        </section>
      )}

      <TodayProgress
        items={[
          { label: "Companies asked", done: companiesAskedToday, goal: COMPANIES_A_DAY },
          { label: "Applications sent", done: appliedToday, goal: APPLIES_A_DAY },
          { label: "Follow-ups due", done: 0, goal: followUps.length, left: true },
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

      <Step n={1} title="Answer people who wrote back" items={answer} empty="No one waiting on a reply from you." />
      <Step n={2} title="Apply to new jobs" items={apply} empty="Nothing new that fits in the last 24 hours. Run a search on the Jobs page." />
      <Step n={3} title="Follow up" items={chase} empty="No follow-ups due today." />
      <Step n={4} title="Open up new companies" items={reach} empty="You've asked at every company on your top 50 list." />

      <Autopilot on={me.autopilot} last={me.lastAutopilot} />

      <details className="mt-8" open={learn || undefined}>
        <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">See more: new jobs, your roles, what&apos;s working, newly funded companies</summary>
        <div className="mt-6">
          {me.prevSeenAt && <NewSinceVisit since={me.prevSeenAt} jobs={jobs} prospects={prospects ?? []} tracks={me.tracks} />}
          <section className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="display text-3xl">Your roles</h2>
              <Link href="/tracks" className="text-sm text-ink-3 hover:text-ink">
                Edit roles
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {stats.map(({ t, inPlay, applied, asks, replies, interviews }) => (
                <Link key={t._id} href={`/jobs?track=${t.key}`} className={`card group relative overflow-hidden p-5 transition-shadow hover:shadow-md ${t.status === "paused" ? "opacity-55" : ""}`}>
                  <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: t.color, boxShadow: `0 0 18px ${t.color}` }} />
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="display text-xl leading-tight">{t.name}</h3>
                    {t.status === "paused" && <span className="text-[11px] text-ink-3">Paused</span>}
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
                    <Stat label="In play" value={inPlay} />
                    <Stat label="Applied" value={applied} />
                    <Stat label="Referrals asked" value={asks} />
                    <Stat label="Replies" value={replies} />
                  </dl>
                  <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
                    {interviews ? `${interviews} in interviews` : asks ? `${Math.round((replies / asks) * 100)}% reply rate` : "No asks yet"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
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

type Todo = { key: string; verb: string; main: string; sub: string; href: string };

/** Today's goals and how far along you are. Counts start again at midnight. */
function TodayProgress({ items }: { items: { label: string; done: number; goal: number; left?: boolean }[] }) {
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
              <div className="h-1 rounded-full bg-accent" style={{ width: `${Math.min(100, (i.done / Math.max(1, i.goal)) * 100)}%` }} />
            </div>
          )}
          {i.left && <div className="mt-2 text-xs text-ink-2">{i.goal ? "Clear these first" : "All caught up"}</div>}
        </div>
      ))}
    </section>
  );
}

const STAGE_WORDS: Record<string, string> = { screening: "Recruiter wrote", interview: "Interview invite", offer: "Offer" };

/** One step of the daily routine, with how many things are in it. */
function Step({ n, title, items, empty }: { n: number; title: string; items: Todo[]; empty: string }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-baseline gap-3">
        <span className="display text-3xl">
          {n}. {title}
        </span>
        <span className="text-sm text-ink-3">{items.length || "Done"}</span>
      </h2>
      {items.length ? <TodoList items={items} /> : <div className="card p-5 text-sm text-ink-2">{empty}</div>}
    </section>
  );
}

/** The first eight things to do, the rest one tap away. */
function TodoList({ items }: { items: Todo[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <div className="card p-2">
      <ul className="divide-y divide-line">
        {shown.map((t) => (
          <li key={t.key}>
            <Link href={t.href} className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-soft">
              <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-accent">{t.verb}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.main}</span>
                <span className="block truncate text-xs text-ink-2">{t.sub}</span>
              </span>
              <span className="text-ink-3">→</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 8 && (
        <button type="button" className="px-3 py-2 text-sm text-ink-3 underline hover:text-ink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Which roles and which fit scores actually get replies, from every application with a known result. */
const SOURCE_LABELS: Record<string, string> = {
  careers: "Company careers boards",
  dreamwork: "Dreamwork",
  jsearch: "Google Jobs",
  adzuna: "Adzuna",
  himalayas: "Himalayas",
  hn: "Hacker News",
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
          {t.responses} of {t.total} replied <b className="ml-1 text-ink">{rate(t)}%</b>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="display text-3xl leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function Setup({ done, n, href, title, text }: { done: boolean; n: number; href: string; title: string; text: string }) {
  return (
    <li>
      <Link href={href} className={`block rounded-xl border border-line p-4 hover:bg-soft ${done ? "opacity-50" : ""}`}>
        <div className="flex items-center gap-2 font-medium">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? "bg-accent text-on-accent" : "bg-soft text-ink"}`}>{done ? "✓" : n}</span>
          {title}
        </div>
        <p className="mt-1 text-sm text-ink-2">{text}</p>
      </Link>
    </li>
  );
}

function JobRow({ j, track, dream }: { j: Pick<Doc<"jobs">, "_id" | "title" | "company" | "companyLogo" | "scores" | "quickFit">; track?: Doc<"tracks">; dream?: boolean }) {
  return (
    <li>
      <Link href={`/jobs/${j._id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-soft">
        <CompanyMark job={j} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{j.title}</div>
          <div className="text-xs text-ink-2">{j.company}</div>
        </div>
        {dream && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] text-on-accent">Dream company</span>}
        <TrackTag track={track} />
        {bestScore(j) ? <ScorePill score={bestScore(j)!.score} /> : <QuickFitPill score={j.quickFit} />}
      </Link>
    </li>
  );
}

/** Roles found since your last visit: your dream companies first, then the best fits. */
function NewSinceVisit({ since, jobs, prospects, tracks }: { since: number; jobs: Doc<"jobs">[]; prospects: Doc<"prospects">[]; tracks: Doc<"tracks">[] }) {
  const dreams = new Set(prospects.filter((p) => p.dream && p.status !== "skip").map((p) => p.key));
  const fit = (j: Doc<"jobs">) => bestScore(j)?.score ?? j.quickFit ?? 0;
  const fresh = jobs
    .filter((j) => j._creationTime > since && j.status === "new")
    .map((j) => ({ j, dream: dreams.has(companyKey(j.company)) }))
    .sort((a, b) => Number(b.dream) - Number(a.dream) || fit(b.j) - fit(a.j));
  if (!fresh.length) return null;
  const atDreams = fresh.filter((f) => f.dream).length;
  return (
    <section className="card mb-10 p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-2xl">New since your last visit</h2>
        <span className="text-sm text-ink-2">
          {fresh.length} {fresh.length === 1 ? "role" : "roles"}
          {atDreams ? `, ${atDreams} at your dream companies` : ""} · since {timeAgo(since)}
        </span>
      </div>
      <ul>
        {fresh.slice(0, 8).map(({ j, dream }) => (
          <JobRow key={j._id} j={j} track={tracks.find((t) => t.key === jobTrackKey(j))} dream={dream} />
        ))}
      </ul>
      {fresh.length > 8 && (
        <Link href="/jobs?sort=added" className="mt-2 inline-block text-sm text-ink-2 underline">
          See all {fresh.length} in Jobs
        </Link>
      )}
    </section>
  );
}

/** The morning search-and-score switch, and what the last run found. */
function Autopilot({ on, last }: { on: boolean; last: { at: number; added: number; scored: number; strong: number; funded?: number; failed?: string[] } | null }) {
  const setAutopilot = useMutation(api.users.setAutopilot);
  return (
    <section className="card mb-10 flex flex-wrap items-center gap-4 p-5">
      <div className="flex-1">
        <div className="font-medium">Morning autopilot {on ? "is on" : "is off"}</div>
        <p className="mt-0.5 text-sm text-ink-2">
          {!on
            ? "Turn it on and every morning at 8 the app searches all your roles and scores what's new, so you start with a ranked list."
            : last
              ? `Last run ${timeAgo(new Date(last.at).toISOString())}: ${last.added} new ${last.added === 1 ? "job" : "jobs"}, ${last.scored} scored, ${last.strong} strong ${last.strong === 1 ? "fit" : "fits"}${last.funded ? `, ${last.funded} newly funded ${last.funded === 1 ? "company" : "companies"}` : ""}.`
              : "First run is tomorrow at 8 in the morning, India time."}
        </p>
        {on && last?.failed?.length ? (
          <p className="mt-1 text-sm text-warn">
            {last.failed.join(", ")} didn&apos;t answer this run, so there may be fewer new jobs than usual. The next run tries again.
          </p>
        ) : null}
      </div>
      {on && last && last.strong > 0 && (
        <Link href="/jobs?fit=strong" className="btn btn-ghost btn-sm">
          See strong fits
        </Link>
      )}
      <button className={`btn btn-sm ${on ? "btn-ghost" : "btn-primary"}`} onClick={() => void setAutopilot({ on: !on })}>
        {on ? "Turn off" : "Turn on"}
      </button>
    </section>
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
