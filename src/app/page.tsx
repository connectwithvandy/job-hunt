"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { companyKey, linkedInPeopleSearch } from "../../convex/lib/company";
import type { Doc } from "../../convex/_generated/dataModel";
import { CompanyMark, QuickFitPill, ScorePill, TrackTag, bestScore, jobTrackKey, timeAgo } from "@/components/bits";
import { Loading } from "@/components/Loading";

const DAY = 86_400_000;
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
    .filter((j) => j.status === "new" && (bestScore(j)?.score ?? 0) >= 75)
    .sort((a, b) => bestScore(b)!.score - bestScore(a)!.score)
    .slice(0, 5);
  const drafts = jobs.flatMap((j) => j.outreach.filter((o) => o.status === "draft").map((o) => ({ j, o })));
  const nudges = jobs.flatMap((j) => j.outreach.filter((o) => o.status === "sent" && o.sentAt && msSince(o.sentAt) > 5 * DAY).map((o) => ({ j, o })));
  const quiet = jobs.filter((j) => j.status === "applied" && j.appliedAt && msSince(j.appliedAt) > 10 * DAY);
  const nothingToDo = !unscored.length && !strong.length && !drafts.length && !nudges.length && !quiet.length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-10">
        <p className="text-sm text-ink-3">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="display mt-1 text-4xl uppercase md:text-6xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      <Autopilot on={me.autopilot} last={me.lastAutopilot} />
      {me.prevSeenAt && <NewSinceVisit since={me.prevSeenAt} jobs={jobs} prospects={prospects ?? []} tracks={me.tracks} />}
      <JustRaised prospects={prospects ?? []} />

      {(me.contactsCount === 0 || jobs.length === 0) && (
        <section className="card mb-10 p-6">
          <h2 className="display mb-4 text-2xl">Next steps</h2>
          <ol className="grid gap-3 md:grid-cols-2">
            <Setup done={jobs.length > 0} n={1} href="/jobs" title="Find your first jobs" text={jobs.length ? `${jobs.length} found. Score them to see which fit.` : searching ? "Finding your first jobs now. They'll appear here in a minute or two." : "Search on the Jobs page, or paste a job description."} />
            <Setup done={me.contactsCount > 0} n={2} href="/network" title="Load your LinkedIn connections" text="So every job shows who you know there." />
          </ol>
        </section>
      )}

      <section className="mb-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="display text-3xl">Your roles</h2>
          <Link href="/tracks" className="text-sm text-ink-3 hover:text-ink">
            Edit roles
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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

      <section>
        <h2 className="display mb-4 text-3xl">Do next</h2>
        {nothingToDo ? (
          <div className="card p-8 text-ink-2">Nothing waiting on you. Find more jobs, or take the evening off.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {strong.length > 0 && (
              <Panel title="Strong fits to apply to" hint="75 and above, not started yet">
                {strong.map((j) => (
                  <JobRow key={j._id} j={j} track={me.tracks.find((t) => t.key === jobTrackKey(j))} />
                ))}
              </Panel>
            )}
            {drafts.length > 0 && (
              <Panel title="Referral notes to send" hint="Drafted, waiting on you">
                {drafts.map(({ j, o }) => (
                  <Row key={j._id + o.contactId} href={`/jobs/${j._id}`} main={o.name} sub={`${j.title} at ${j.company}`} />
                ))}
              </Panel>
            )}
            {nudges.length > 0 && (
              <Panel title="Nudge these people" hint="Asked over 5 days ago, no reply">
                {nudges.map(({ j, o }) => (
                  <Row key={j._id + o.contactId} href={`/jobs/${j._id}`} main={o.name} sub={`Asked ${timeAgo(o.sentAt)} about ${j.company}`} />
                ))}
              </Panel>
            )}
            {quiet.length > 0 && (
              <Panel title="Gone quiet" hint="Applied over 10 days ago">
                {quiet.map((j) => (
                  <Row key={j._id} href={`/jobs/${j._id}`} main={`${j.title} at ${j.company}`} sub={`Applied ${timeAgo(j.appliedAt)}. Follow up, or find someone inside.`} />
                ))}
              </Panel>
            )}
            {unscored.length > 0 && (
              <Panel title={`${unscored.length} new ${unscored.length === 1 ? "job" : "jobs"} to score`} hint="See which ones are worth your time">
                <Row href="/jobs" main="Open jobs and score them" sub="Takes about 15 seconds each" />
              </Panel>
            )}
          </div>
        )}
      </section>

      <p className="mt-16 text-xs text-ink-3">
        {me.email} · {me.contactsCount.toLocaleString()} connections loaded
      </p>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
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

function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-medium">{title}</h3>
      <p className="mb-3 text-xs text-ink-3">{hint}</p>
      <ul className="divide-y divide-line">{children}</ul>
    </div>
  );
}

function Row({ href, main, sub }: { href: string; main: string; sub: string }) {
  return (
    <li>
      <Link href={href} className="-mx-2 block rounded-lg px-2 py-2.5 hover:bg-soft">
        <div className="text-sm font-medium">{main}</div>
        <div className="text-xs text-ink-2">{sub}</div>
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
function Autopilot({ on, last }: { on: boolean; last: { at: number; added: number; scored: number; strong: number; funded?: number } | null }) {
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
