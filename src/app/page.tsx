import Link from "next/link";
import { CompanyMark, ScorePill, TrackTag, bestScore, jobTrackId, timeAgo } from "@/components/bits";
import { aiMode } from "@/lib/ai";
import { getContacts, getJobs, getResume, getTracks } from "@/lib/store";
import type { Job } from "@/lib/types";

const DAY = 86_400_000;
const LIVE = new Set(["applying", "applied", "screening", "interview", "offer"]);

export default async function Today() {
  const [jobs, tracks, resume, contacts] = await Promise.all([getJobs(), getTracks(), getResume(), getContacts()]);
  const firstName = resume?.name.split(" ")[0];
  const stats = tracks.map((t) => {
    const mine = jobs.filter((j) => jobTrackId(j) === t.id && j.status !== "dismissed");
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
  const nudges = jobs.flatMap((j) =>
    j.outreach.filter((o) => o.status === "sent" && o.sentAt && msSince(o.sentAt) > 5 * DAY).map((o) => ({ j, o })),
  );
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

      {(!resume || contacts.length === 0 || jobs.length === 0) && (
        <section className="card mb-10 p-6">
          <h2 className="display mb-4 text-2xl">Get set up</h2>
          <ol className="grid gap-3 md:grid-cols-3">
            <Setup done={!!resume} n={1} href="/resume" title="Upload your CV" text="PDF or Word. Each job gets a tailored copy of it." />
            <Setup done={contacts.length > 0} n={2} href="/network" title="Load your LinkedIn connections" text="So every job shows who you know there." />
            <Setup done={jobs.length > 0} n={3} href="/jobs" title="Find your first jobs" text="Search Dreamwork per track, or paste a link." />
          </ol>
        </section>
      )}

      <section className="mb-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="display text-3xl">Your tracks</h2>
          <Link href="/tracks" className="text-sm text-ink-3 hover:text-ink">Edit tracks</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {stats.map(({ t, inPlay, applied, asks, replies, interviews }) => (
            <Link key={t.id} href={`/jobs?track=${t.id}`} className={`card group relative overflow-hidden p-5 transition-shadow hover:shadow-md ${t.status === "paused" ? "opacity-55" : ""}`}>
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
                  <JobRow key={j.id} j={j} track={tracks.find((t) => t.id === jobTrackId(j))} />
                ))}
              </Panel>
            )}
            {drafts.length > 0 && (
              <Panel title="Referral notes to send" hint="Drafted, waiting on you">
                {drafts.map(({ j, o }) => (
                  <Row key={j.id + o.contactId} href={`/jobs/${j.id}`} main={o.name} sub={`${j.title} at ${j.company}`} />
                ))}
              </Panel>
            )}
            {nudges.length > 0 && (
              <Panel title="Nudge these people" hint="Asked over 5 days ago, no reply">
                {nudges.map(({ j, o }) => (
                  <Row key={j.id + o.contactId} href={`/jobs/${j.id}`} main={o.name} sub={`Asked ${timeAgo(o.sentAt)} about ${j.company}`} />
                ))}
              </Panel>
            )}
            {quiet.length > 0 && (
              <Panel title="Gone quiet" hint="Applied over 10 days ago">
                {quiet.map((j) => (
                  <Row key={j.id} href={`/jobs/${j.id}`} main={`${j.title} at ${j.company}`} sub={`Applied ${timeAgo(j.appliedAt)}. Follow up, or find someone inside.`} />
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

      <p className="mt-16 text-xs text-ink-3">AI: {aiMode()} · {contacts.length.toLocaleString()} connections loaded</p>
    </div>
  );
}

function msSince(iso: string) {
  return Date.now() - new Date(iso).getTime();
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
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

function JobRow({ j, track }: { j: Job; track?: Parameters<typeof TrackTag>[0]["track"] }) {
  return (
    <li>
      <Link href={`/jobs/${j.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-soft">
        <CompanyMark job={j} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{j.title}</div>
          <div className="text-xs text-ink-2">{j.company}</div>
        </div>
        <TrackTag track={track} />
        <ScorePill score={bestScore(j)?.score} />
      </Link>
    </li>
  );
}
