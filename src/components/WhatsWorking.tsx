"use client";

// What gets replies, from every application with a known result. Lives on Applications (moved from Today, 19 Nov).
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { replyTiming } from "../../convex/lib/followups";
import { BANDS, SILENT_AFTER, countNoes, tallyBy, tallyOutcomes, type Tally } from "../../convex/lib/outcomes";
import type { Doc } from "../../convex/_generated/dataModel";
import { jobTrackKey, timeAgo } from "@/components/bits";
import { ActionButton } from "@/components/ui";

const DAY = 86_400_000;
/** A rate means something from this many results; below it, the row stays hidden. */
const SURE = 5;

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

export function WhatsWorking({ jobs, tracks, lessons }: { jobs: Doc<"jobs">[]; tracks: Doc<"tracks">[]; lessons: Lessons | null }) {
  const [now] = useState(() => Date.now());
  const { total, byTrack, byBand } = tallyOutcomes(jobs, jobTrackKey, now);
  if (!total) return null;
  const rate = (t: Tally) => Math.round((t.responses / t.total) * 100);
  // A row with fewer than five results is noise, not a pattern (19 Nov: "0 of 1 replied" shown as a finding).
  const line = (label: string, t: Tally | undefined, color?: string) =>
    t &&
    t.total >= SURE && (
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
  const referral = tallyBy(jobs, (j) => (j.outreach.some((o) => o.status !== "draft") ? "Asked someone for a referral" : "No referral ask"), now);
  const speed = tallyBy(
    jobs,
    (j) => {
      const posted = j.postedAt ? new Date(j.postedAt).getTime() : NaN;
      if (!j.appliedAt || !Number.isFinite(posted)) return null;
      return j.appliedAt - posted <= 3 * DAY ? "Applied within 3 days of posting" : "Applied later";
    },
    now,
  );
  const anyway = jobs.some((j) => j.wroteAnyway) ? tallyBy(jobs, (j) => (j.wroteAnyway ? "Wrote the CV though the fit was low" : "Fit was high enough to apply"), now) : new Map<string, Tally>();
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
  // Only groups with at least one row of five or more results; the rest wait until there's enough to say something.
  const cards = [
    { title: "By role", rows: tracks.map((t) => line(t.name, byTrack.get(t.key), t.color)).filter(Boolean) },
    { title: "By fit score", rows: BANDS.map((b) => line(b.label, byBand.get(b.key))).filter(Boolean) },
    { title: "By how you applied", rows: habits.map(([label, t]) => line(label, t)).filter(Boolean) },
    {
      title: "By message",
      rows: [...kinds, ...askSplit].filter(([, t]) => t.total).map(([label, t]) => line(label, t)).filter(Boolean),
      note:
        timing.toFirst + timing.toFollowUp >= SURE ? (
          <p className="mt-2 text-xs text-ink-3">
            {timing.toFollowUp} of {timing.toFirst + timing.toFollowUp} replies came after a follow-up.
          </p>
        ) : null,
    },
    { title: "By where you found it", rows: [...source].map(([label, t]) => line(label, t)).filter(Boolean) },
  ].filter((c) => c.rows.length);
  return (
    <section id="working" className="mt-2 mb-12 scroll-mt-20">
      <h2 className="h2 mb-1">What&apos;s working</h2>
      <p className="mb-4 max-w-[68ch] text-[15px] text-ink-3">
        From {total} application{total === 1 ? "" : "s"} with a result: a reply, a no, or silence after {SILENT_AFTER / 86_400_000} days.
      </p>
      {/* What unlocks as results come in, in one list instead of three sentences with three numbers (27 Nov review). */}
      {(total < 5 || (countNoes(jobs, now) < 3 && !lessons)) && (
        <>
        <p className="mb-2 text-[13px] font-semibold text-ink-2">Unlocks as your applications get a result</p>
        <ul className="card mb-4 divide-y divide-line">
          {[
            { what: "Fit scores learn from your results", have: total, need: 3 },
            { what: "The gap that keeps costing you, from noes and silences", have: countNoes(jobs, now), need: 3 },
            { what: "Patterns by how you applied, message and source", have: total, need: 5 },
          ].map((m) => (
            <li key={m.what} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
              <span className="min-w-0 flex-1 basis-full text-[15px] text-ink-2 sm:basis-0">{m.what}</span>
              <span className="tnum text-[13px] text-ink-3">{m.have >= m.need ? "On" : `${m.have} of ${m.need}`}</span>
              <span className="h-1 w-16 overflow-hidden rounded-[2px] bg-line-strong" aria-hidden>
                <span className="block h-full bg-ink" style={{ width: `${Math.min(100, (m.have / m.need) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
        </>
      )}
      <LessonsCard jobs={jobs} lessons={lessons} now={now} />
      {cards.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <div key={c.title} className="card p-5">
              <h3 className="text-[15px] font-semibold">{c.title}</h3>
              <ul className="divide-y divide-line">{c.rows}</ul>
              {c.note}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const KIND_WORDS = { cv: "Show it on your CV", skill: "Build it", targeting: "Aim differently" };

/** The gaps that keep coming up in your noes, read by AI once there are enough of them. */
function LessonsCard({ jobs, lessons, now }: { jobs: Doc<"jobs">[]; lessons: Lessons | null; now: number }) {
  const learn = useAction(api.agent.learnFromNoes);
  const noes = countNoes(jobs, now);
  // Below three, the progress list above says how far along it is.
  if (noes < 3 && !lessons) return null;
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
