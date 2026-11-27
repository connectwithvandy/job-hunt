"use client";

import { useMutation, useQuery } from "convex/react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { PIPELINE } from "../../../convex/lib/defaults";
import { CompanyMark, timeAgo } from "@/components/bits";
import { useSetStatus } from "@/components/Celebrate";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Loading } from "@/components/Loading";
import { trackerStatus } from "@/lib/replies";
import { cleanSubject } from "@/lib/calendarInvite";
import { tidyTitle } from "@/lib/tidy";
import { WhatsWorking } from "@/components/WhatsWorking";
import { STAGE_HINT, STAGE_WORDS, STAGES } from "@/lib/stages";
import { openStages } from "@/lib/pipelineCounts";
import { daysSince } from "@/components/JobState";
import { useEscape } from "@/components/Sidebar";

const DAY = 86_400_000;
/** After this long with no email back, an application asks for a nudge. */
const NUDGE_AFTER = 7 * DAY;

/** One line in an empty column saying how a job gets there. */
const EMPTY_HINT: Record<string, string> = {
  applying: "Tailor a CV to move a job here",
  applied: "Jobs you apply to land here",
  screening: "Recruiter calls land here",
  interview: "Interviews land here",
  offer: "Offers land here",
  rejected: "Jobs that closed or you dropped",
};

type Job = Doc<"jobs">;
type Status = Job["status"];

export default function TrackerPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Tracker />
    </Suspense>
  );
}

function Tracker() {
  // Today's pipeline strip links here with ?stage=applied: that stage opens on a phone, and its column is marked and
  // scrolled to on a computer.
  const asked = useSearchParams().get("stage");
  const linked = asked && PIPELINE.some((p) => p.status === asked) ? asked : null;
  const me = useQuery(api.users.me);
  const jobs = useQuery(api.jobs.list);
  const prefs = useQuery(api.users.jobPrefs);
  const setStatus = useSetStatus();
  const [over, setOver] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(linked);
  const [moving, setMoving] = useState<Job | null>(null);
  const archive = useMutation(api.jobs.setStatusMany);
  const [archiving, setArchiving] = useState(false);
  const [now] = useState(() => Date.now());
  useEscape(!!moving, () => setMoving(null));
  // Once, when the board first draws: later live updates must not pull the page back.
  const loaded = jobs !== undefined;
  useEffect(() => {
    if (loaded && linked && window.innerWidth >= 768) document.getElementById(`stage-${linked}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [loaded, linked]);
  if (!me || !jobs) return <Loading />;
  const byStage = new Map(PIPELINE.map((p) => [p.status, jobs.filter((j) => trackerStatus(j) === p.status).sort((a, b) => b.updatedAt - a.updatedAt)]));
  const total = PIPELINE.reduce((n, p) => n + (byStage.get(p.status)?.length ?? 0), 0);
  const closed = byStage.get("rejected")?.length ?? 0;
  const live = total - closed;
  // The pipeline's first two stages live on Jobs; the board shows them as slim columns so it matches Today's strip.
  const early = openStages(jobs, now, prefs?.maxAgeDays);
  const earlyStages = STAGES.filter((st) => st.status === "new").map((st) => ({ ...st, n: early[st.key as "prospect" | "qualified"], href: st.key === "qualified" ? "/jobs?fit=ok" : "/jobs" }));
  const gone = jobs.filter((j) => j.status === "applying" && j.liveCheck?.state === "closed");
  const gmailOff = !me.inboxAt || now - me.inboxAt > DAY;
  // Phone: one stage at a time. Opens where something is due (an application with no reply for a week), else on the
  // first stage with something in it (27 Nov review: the overdue Nudge hid behind another chip).
  const due = (byStage.get("applied") ?? []).some((j) => !!j.appliedAt && now - j.appliedAt > NUDGE_AFTER && !j.lastEmail);
  const stage = picked ?? (due ? "applied" : PIPELINE.find((p) => byStage.get(p.status)?.length)?.status ?? "applied");
  const move = (j: Job, to: string) => {
    if (to !== trackerStatus(j)) void setStatus({ jobId: j._id, status: to as Status });
  };

  const card = (j: Job) => {
    const st = trackerStatus(j);
    const quiet = st === "applied" && !!j.appliedAt && now - j.appliedAt > NUDGE_AFTER && !j.lastEmail;
    return (
      <li
        key={j._id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", `${j._id}|${st}`);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setOver(null)}
        className="card p-3.5 md:cursor-grab md:active:cursor-grabbing"
      >
        <Link href={`/jobs/${j._id}`} className="flex min-h-11 gap-3">
          <CompanyMark job={j} size={32} />
          <span className="min-w-0">
            <span className="row-title line-clamp-3 !text-[14px] [overflow-wrap:anywhere] hyphens-auto" title={tidyTitle(j.title)}>
              {tidyTitle(j.title)}
            </span>
            <span className="row-meta block truncate">{j.company}</span>
          </span>
        </Link>
        {j.lastEmail && (
          <p className="row-meta mt-2 truncate" title={`${j.lastEmail.from}: ${j.lastEmail.subject}`}>
            Email {timeAgo(j.lastEmail.at)}: {cleanSubject(j.lastEmail.subject)}
          </p>
        )}
        {quiet && <p className="mono mt-3 whitespace-nowrap">No reply · {daysSince(j.appliedAt!)}d</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 whitespace-nowrap">
          <button type="button" className="btn-text -ml-1 underline-offset-2 [@media(hover:none)]:underline" onClick={() => setMoving(j)}>
            Move to ▾
          </button>
          {quiet ? (
            <Link href={`/jobs/${j._id}#people`} className="btn btn-secondary btn-sm">
              Nudge
            </Link>
          ) : (
            <span className="row-meta tnum">{j.appliedAt ? timeAgo(j.appliedAt) : timeAgo(j.updatedAt)}</span>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="h1">Applications</h1>
          <span className="tnum text-[15px] text-ink-3">{total ? `${live} in progress${closed ? ` · ${closed} closed` : ""}` : ""}</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-3">
          <span className="block">
            Prospect and Qualified jobs are in{" "}
            <Link href="/jobs" className="font-semibold text-ink-2 underline underline-offset-2">
              Jobs
            </Link>
            .
          </span>
          {!total && "Applications show up here once you start one."}
        </p>
      </header>
      {gmailOff && (
        <section className="card mb-6 flex flex-wrap items-center gap-3 px-5 py-4 order-5 mt-6 max-[479px]:flex-col max-[479px]:items-start">
          <p className="min-w-0 flex-1 text-[15px] text-ink-2">{me.inboxAt ? "Gmail stopped checking. Replies won't move your applications." : "Connect Gmail and replies move your applications by themselves."}</p>
          <Link href="/connect#gmail" className="btn btn-secondary btn-sm">
            Connect Gmail
          </Link>
        </section>
      )}
      {gone.length > 0 && (
        <section className="card mb-6 flex flex-wrap items-center gap-3 px-5 py-4 max-[479px]:flex-col max-[479px]:items-start">
          <p className="min-w-0 flex-1 text-[15px] text-ink-2">
            {gone.length} saved {gone.length === 1 ? "role has" : "roles have"} closed: {gone.slice(0, 3).map((j) => j.company).join(", ")}
            {gone.length > 3 ? " and more" : ""}.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={archiving}
            onClick={async () => {
              setArchiving(true);
              try {
                await archive({ jobIds: gone.map((j) => j._id), status: "dismissed" });
              } finally {
                setArchiving(false);
              }
            }}
          >
            {archiving ? "Archiving…" : "Archive all"}
          </button>
        </section>
      )}

      {/* Phone: stage chips you can scroll sideways, then the chosen stage as a list. */}
      <div className="md:hidden">
        <div
          ref={(el) => {
            // The chosen stage's chip in view when the page opens (27 Nov review: "Sent" sat off-screen).
            const on = el?.querySelector<HTMLElement>('[aria-selected="true"]');
            if (el && on && on.offsetLeft + on.offsetWidth > el.clientWidth) el.scrollLeft = on.offsetLeft - 64; // the chip before it stays partly in view (28 Nov review)
          }}
          className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pr-10 pb-1 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-24px),transparent)]"
          role="tablist"
          aria-label="Stages"
        >
          {earlyStages.map((st) => (
            <Link
              key={st.key} href={st.href} aria-label={`${st.word}, ${st.hint}: ${st.n}. Opens Jobs`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-dashed border-line-strong bg-transparent px-4 text-[13px] font-semibold text-ink-2">
              {st.word}
              <span className="tnum text-ink-3">{st.n}</span>
              <span aria-hidden className="text-ink-3">↗</span>
            </Link>
          ))}
          {PIPELINE.map((p) => {
            const on = p.status === stage;
            const n = byStage.get(p.status)?.length ?? 0;
            return (
              <button
                key={p.status}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPicked(p.status)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold ${on ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-2"}`}
              >
                {STAGE_WORDS[p.status]}
                <span className={`tnum ${on ? "opacity-70" : "text-ink-3"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <p className="mb-3 text-[13px] text-ink-3">
          <span className="font-semibold text-ink-2">{STAGE_WORDS[stage]}</span>: {STAGE_HINT[stage]}
        </p>
        {byStage.get(stage)?.length ? (
          <ul className="space-y-3">{byStage.get(stage)!.map(card)}</ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-[15px] text-ink-3">Nothing in {STAGE_WORDS[stage]} yet.</p>
        )}
      </div>

      {/* Computer: Prospect and Qualified as one thin strip (they live in Jobs), so the six real stages get the width and
          titles stop wrapping to six lines (28 Nov review). Drag a card or use Move to…. */}
      <div className="mb-4 hidden flex-wrap items-center gap-2 md:flex">
        {earlyStages.map((st) => (
          <Link key={st.key} href={st.href} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-card px-3 text-[13px] text-ink-2 hover:text-ink">
            <span className="mono !text-ink-3">{st.word}</span>
            <span className="tnum font-semibold text-ink">{st.n}</span>
            <span className="text-ink-3">{st.key === "qualified" ? "60+" : "open"} · in Jobs →</span>
          </Link>
        ))}
      </div>
      <div className="hidden grid-cols-6 gap-3 md:grid">
        {PIPELINE.map((col) => {
          const cards = byStage.get(col.status) ?? [];
          return (
            <section key={col.status} id={`stage-${col.status}`} className="min-w-0 scroll-mt-24">
              <h2 className="mb-3 px-1" aria-current={linked === col.status ? "step" : undefined}>
                <span className="flex items-baseline gap-2">
                  <span className={`mono ${linked === col.status ? "!font-semibold !text-ink" : "!text-ink-2"}`}>{STAGE_WORDS[col.status]}</span>
                  <span className="tnum text-[13px] text-ink-3">{cards.length}</span>
                </span>
                <span className="block text-[12px] font-normal text-ink-3">{STAGE_HINT[col.status]}</span>
                {linked === col.status && <span className="mt-1 block h-[3px] rounded-full bg-accent" aria-hidden />}
              </h2>
              <ul
                aria-label={STAGE_WORDS[col.status]}
                className={`min-h-40 space-y-3 rounded-2xl ${cards.length ? "" : "border border-dashed border-line-strong"} ${over === col.status ? "outline-2 outline-offset-2 outline-ink" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== col.status) setOver(col.status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const [jobId, from] = e.dataTransfer.getData("text/plain").split("|");
                  if (jobId && from !== col.status) void setStatus({ jobId: jobId as Id<"jobs">, status: col.status as Status });
                }}
              >
                {cards.map(card)}
                {!cards.length && EMPTY_HINT[col.status] && <li className="px-3 pt-14 text-center text-[13px] text-ink-3">{EMPTY_HINT[col.status]}</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {moving && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default bg-black/30" onClick={() => setMoving(null)} />
          <div aria-label={`Move ${moving.company}`} className="sheet card pop fixed inset-x-0 bottom-0 z-50 rounded-b-none p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-72 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-b-[16px] md:pb-2">
            <p className="px-3 pt-2 pb-2 text-[13px] font-semibold text-ink-2">Move {moving.company} to</p>
            {PIPELINE.map((p) => {
              const here = trackerStatus(moving) === p.status;
              return (
                <button
                  key={p.status}
                  aria-pressed={here}
                  type="button"
                  className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-[15px] hover:bg-soft md:min-h-9 ${here ? "font-semibold" : ""}`}
                  onClick={() => {
                    move(moving, p.status);
                    setMoving(null);
                  }}
                >
                  {STAGE_WORDS[p.status]}
                  {here && <span aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* What gets replies, next to the applications it comes from. */}
      <div id="working" className="order-6 mt-12 scroll-mt-24 max-md:mt-8">
        <WhatsWorking jobs={jobs} tracks={me.tracks} lessons={me.lessons} />
      </div>
    </div>
  );
}
