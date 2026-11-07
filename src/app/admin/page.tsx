"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState, useTransition } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PageHead } from "@/components/bits";
import { errorMessage } from "@/lib/errors";
import { Loading } from "@/components/Loading";
import { ActionButton, attempt, Feedback, type ActionState } from "@/components/ui";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "feedback", label: "Feedback" },
  { key: "errors", label: "Errors" },
] as const;

/** The owner's admin centre: who's waiting, who's using JobPipe, what people say, and what broke. */
export default function AdminCentre() {
  const me = useQuery(api.users.me);
  const list = useQuery(api.access.list, me?.isOwner ? {} : "skip");
  const feedback = useQuery(api.feedback.list, me?.isOwner ? {} : "skip");
  const reviews = useQuery(api.cvReviews.list, me?.isOwner ? {} : "skip");
  const errors = useQuery(api.errors.recent, me?.isOwner ? {} : "skip");
  const surveys = useQuery(api.surveys.list, me?.isOwner ? {} : "skip");
  const clearErrors = useMutation(api.errors.clear);
  const setApproved = useMutation(api.access.setApproved);
  const setRejected = useMutation(api.access.setRejected);
  const addPaidTime = useMutation(api.access.addPaidTime);
  const clearPaidTime = useMutation(api.access.clearPaidTime);
  const approveMany = useMutation(api.access.approveMany);
  const resetPassword = useAction(api.access.resetPassword);
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);
  const [picked, setPicked] = useState<Set<Id<"access">>>(new Set());
  const count = useAction(api.stats.funnel);
  const [usageError, setUsageError] = useState("");
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof count>> | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  // Usage reads everyone's jobs, so it loads once when the owner opens the page, then on "Count again".
  const isOwner = !!me?.isOwner;
  useEffect(() => {
    if (isOwner) count({}).then(setUsage, (err) => setUsageError(errorMessage(err)));
  }, [isOwner, count]);
  if (!me) return <Loading />;
  if (!me.isOwner) return <p className="text-ink-2">Only the owner can see the waitlist.</p>;
  if (!list) return <Loading />;

  const row = (a: Doc<"access">, approve: boolean) => (
    <li key={a._id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
      <label className="flex items-center gap-3">
        {approve && (
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={picked.has(a._id)}
            onChange={(e) => {
              const next = new Set(picked);
              if (e.target.checked) next.add(a._id);
              else next.delete(a._id);
              setPicked(next);
            }}
          />
        )}
        <div>
          <div className="font-medium">{a.name ? `${a.name} · ${a.email}` : a.email || "No email"}</div>
          <div className="text-xs text-ink-3">
            {[a.role, `Signed up ${new Date(a._creationTime).toLocaleDateString()}`, !approve && (a.welcomedAt ? "Welcome email sent" : list.emailOn ? "Welcome email not sent yet" : ""), !approve && (a.paidUntil ? `Paid until ${new Date(a.paidUntil).toLocaleDateString()}` : "Not paid")]
              .filter(Boolean)
              .join(" · ")}
            {a.linkedin && (
              <>
                {" · "}
                <a className="underline" href={a.linkedin.startsWith("http") ? a.linkedin : `https://${a.linkedin}`} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              </>
            )}
          </div>
          {!approve && usage && <UsageLine now={usage.now} u={usage.usage.find((u) => u.accessId === a._id)} />}
        </div>
      </label>
      <div className="flex flex-wrap items-center gap-2">
      <ActionButton size="sm" variant="ghost" run={async () => {
          if (!window.confirm(`Give ${a.email} a new password? Their old one stops working and they're signed out.`)) return;
          setReset(await resetPassword({ accessId: a._id }));
        }}>
        Reset password
      </ActionButton>
      {!approve && (
        <ActionButton size="sm" variant="ghost" run={async () => {
            if (!window.confirm(`Add 3 months of paid time for ${a.email}? Only for someone paid for outside the app.`)) return;
            await addPaidTime({ accessId: a._id });
          }}>
          Add 3 months paid
        </ActionButton>
      )}
      {!approve && !!a.paidUntil && (
        <ActionButton size="sm" variant="ghost" run={async () => {
            if (!window.confirm(`Remove all paid time for ${a.email}? If their free trial is over, their AI tools stop.`)) return;
            await clearPaidTime({ accessId: a._id });
          }}>
          Clear paid time
        </ActionButton>
      )}
      {approve && !a.rejected && (
        <ActionButton size="sm" variant="ghost" run={async () => {
            if (!window.confirm(`Turn down ${a.email}? They'll see a short "not this round" note. You can let them in later.`)) return;
            await setRejected({ accessId: a._id, rejected: true });
          }}>
          Reject
        </ActionButton>
      )}
      <ActionButton size="sm" variant={approve ? "primary" : "ghost"} run={async () => {
          if (!approve && !window.confirm(`Remove ${a.email}'s access? Their saved jobs stay, but they can't use JobPipe.`)) return;
          await setApproved({ accessId: a._id, approved: approve });
          // With email on, JobPipe sends the welcome itself. Without it, open your email app with the note ready.
          if (approve && a.email && !list.emailOn) window.location.href = welcomeEmail([a.email]);
        }}>
        {approve ? "Let in" : "Remove access"}
      </ActionButton>
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="Admin"
        sub={`Only you see this. Anyone who picks a sales role at signup gets in straight away; people who pick "Other" wait for you. ${
          list.emailOn
            ? "Letting someone in sends them a personal \"you're in\" email from hello@jobpipe.in."
            : "Letting someone in opens your email app with a note to tell them. (Automatic email is off until RESEND_API_KEY is set.)"
        }`}
      />
      <div className="mb-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === "people" && list.waiting.length > 0 ? ` (${list.waiting.length} waiting)` : ""}
            {t.key === "errors" && errors?.length ? ` (${errors.length})` : ""}
          </button>
        ))}
      </div>
      {usageError && <p className="mb-3 text-sm text-bad">Couldn&apos;t count usage: {usageError}</p>}
      {tab === "overview" && <Overview list={list} usage={usage} count={async () => setUsage(await count({}))} />}
      {tab === "people" && (
        <>
      {reset && (
        <div className="card mb-6 space-y-2 p-5 text-sm">
          <p>
            New password for <b>{reset.email}</b>: <code className="rounded bg-line px-1.5 py-0.5 font-mono">{reset.password}</code>
          </p>
          <p className="text-ink-2">It&apos;s shown only once. Send it to them; they sign in with it as usual.</p>
          <div className="flex gap-3">
            <a className="btn btn-primary btn-sm" href={passwordEmail(reset.email, reset.password)}>
              Email it to them
            </a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReset(null)}>
              Done
            </button>
          </div>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-ink-2">Waiting ({list.waiting.length})</h2>
        {list.waiting.length > 1 && (
          <button
            type="button"
            className="text-sm text-ink-3 underline hover:text-ink"
            onClick={() => setPicked(picked.size === list.waiting.length ? new Set() : new Set(list.waiting.map((a) => a._id)))}
          >
            {picked.size === list.waiting.length ? "Clear" : "Select all"}
          </button>
        )}
        {picked.size > 0 && (
          <ActionButton
            size="sm"
            variant="primary"
            run={async () => {
              const emails = await approveMany({ accessIds: [...picked] });
              setPicked(new Set());
              // Without email on: one note to everyone, each hidden from the others.
              if (emails.length && !list.emailOn) window.location.href = welcomeEmail(emails);
            }}
          >
            Let in {picked.size} {picked.size === 1 ? "person" : "people"}
          </ActionButton>
        )}
      </div>
      {list.waiting.length ? <ul className="mb-10">{list.waiting.map((a) => row(a, true))}</ul> : <p className="mb-10 text-sm text-ink-3">Nobody waiting.</p>}
      {list.rejected.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-medium text-ink-2">Turned down ({list.rejected.length})</h2>
          <ul className="mb-10">{list.rejected.map((a) => row(a, true))}</ul>
        </>
      )}
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-medium text-ink-2">Let in ({list.approved.length})</h2>
        <CountButton count={async () => setUsage(await count({}))} done={!!usage} />
      </div>
      {list.approved.length ? <ul>{list.approved.map((a) => row(a, false))}</ul> : <p className="text-sm text-ink-3">Nobody yet.</p>}
        </>
      )}
      {tab === "feedback" && (
        <>
      <h2 className="mb-2 text-sm font-medium text-ink-2">Free CV reviews ({reviews?.length ?? 0})</h2>
      {reviews?.length ? (
        <ul className="mb-10">
          {reviews.map((r) => (
            <li key={r._id} className="border-b border-line py-2 text-sm">
              {r.email} · {r.role} · <b>{r.score}</b>/100 · <span className="text-ink-3">{new Date(r._creationTime).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-10 text-sm text-ink-3">Nobody yet. They come from jobpipe.in/cv-review.</p>
      )}
      <h2 className="mt-10 mb-2 text-sm font-medium text-ink-2">Feedback ({feedback?.length ?? 0})</h2>
      {feedback?.length ? (
        <ul>
          {feedback.map((f) => (
            <li key={f._id} className="border-b border-line py-3 text-sm">
              <p className="whitespace-pre-wrap">{f.text}</p>
              <p className="mt-1 text-xs text-ink-3">
                {f.email} · {f.page} · {new Date(f._creationTime).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">Nothing yet.</p>
      )}
      <SurveyAnswers rows={surveys} />
        </>
      )}
      {tab === "errors" && (
        <>
      <h2 className="mb-2 text-sm font-medium text-ink-2">Errors people hit ({errors?.length ?? 0})</h2>
      <p className="mb-2 text-xs text-ink-3">New ones are in your morning email. Clear the ones you&apos;ve dealt with.</p>
      {errors?.length ? (
        <>
        <button type="button" className="btn btn-ghost btn-sm mb-2" onClick={() => void clearErrors({ ids: errors.map((e) => e._id) }).catch(() => {})}>
          Clear all
        </button>
        <ul>
          {errors.map((e) => (
            <li key={e._id} className="border-b border-line py-3 text-sm">
              <p className="whitespace-pre-wrap break-words font-mono text-xs">{e.message}</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-3">
                  {e.email || "signed out"} · {e.page} · {new Date(e._creationTime).toLocaleString()}
                </p>
                <button type="button" className="text-xs text-ink-2 hover:text-ink" onClick={() => void clearErrors({ ids: [e._id] }).catch(() => {})}>
                  Clear
                </button>
              </div>
            </li>
          ))}
        </ul>
        </>
      ) : (
        <p className="text-sm text-ink-3">None.</p>
      )}
        </>
      )}
    </div>
  );
}

const SURVEY_LABELS = { found_jobs: "Day 3 · finding good jobs?", recommend: "Day 12 · recommend, 0 to 10", interviews: "Monthly · interviews yet?" } as const;

/** What people answered in the timed pop-up: a quick summary, then each answer. */
function SurveyAnswers({ rows }: { rows: Doc<"surveyAnswers">[] | undefined }) {
  const answered = (rows ?? []).filter((r) => !r.skipped);
  const scores = answered.filter((r) => r.score !== undefined).map((r) => r.score!);
  const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
  const tally = (kind: "found_jobs" | "interviews") => {
    const counts = new Map<string, number>();
    for (const r of answered) if (r.kind === kind && r.choice) counts.set(r.choice, (counts.get(r.choice) ?? 0) + 1);
    return [...counts].map(([c, n]) => `${c}: ${n}`).join(" · ") || "none yet";
  };
  return (
    <section className="mt-10">
      <h2 className="mb-2 text-sm font-medium text-ink-2">Pop-up answers ({answered.length} answered, {(rows?.length ?? 0) - answered.length} closed)</h2>
      <ul className="mb-3 grid gap-1 text-sm">
        <li>Finding good jobs: {tally("found_jobs")}</li>
        <li>Recommend: {average ? `${average} average from ${scores.length}` : "none yet"}</li>
        <li>Interviews: {tally("interviews")}</li>
      </ul>
      {answered.length ? (
        <ul>
          {answered.map((r) => (
            <li key={r._id} className="border-b border-line py-3 text-sm">
              <p>
                <span className="text-ink-3">{SURVEY_LABELS[r.kind]}:</span> {r.score ?? r.choice}
              </p>
              {r.note && <p className="mt-1 whitespace-pre-wrap">{r.note}</p>}
              <p className="mt-1 text-xs text-ink-3">
                {r.email} · {new Date(r._creationTime).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">Nothing yet. The first questions go out on people&apos;s second day.</p>
      )}
    </section>
  );
}

/** The "Count" button. Counting reads everyone's jobs, so it runs only when you click. */
function CountButton({ count, done }: { count: () => Promise<void>; done: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setState(await attempt(count)))}>
        {pending ? "Counting…" : done ? "Count again" : "Show usage"}
      </button>
      <Feedback state={state} />
    </>
  );
}

/** One person's usage: when they were last on, and what they've done. */
function UsageLine({ now, u }: { now: number; u?: { lastSeenAt?: number; setUp: boolean; jobs: number; scored: number; tailored: number; applied: number } }) {
  if (!u) return null;
  const days = u.lastSeenAt ? Math.floor((now - u.lastSeenAt) / 86_400_000) : null;
  const seen = days === null ? "Never opened the app" : days === 0 ? "Last on today" : days === 1 ? "Last on yesterday" : `Last on ${days} days ago`;
  const parts = u.setUp ? [`${u.jobs} jobs found`, `${u.scored} scored`, `${u.tailored} CVs tailored`, `${u.applied} applied`] : ["Hasn't finished setup"];
  return <div className={`mt-0.5 text-xs ${days === null || days > 3 ? "text-red-500" : "text-ink-2"}`}>{[seen, ...parts].join(" · ")}</div>;
}

/** The numbers at a glance: who's waiting, who's using it, who's gone quiet, who paid. Then the step-by-step funnel. */
function Overview({ list, usage, count }: { list: { waiting: Doc<"access">[]; approved: Doc<"access">[] }; usage: { usage: { lastSeenAt?: number }[]; steps: { step: string; people: number }[]; now: number } | null; count: () => Promise<void> }) {
  const day = 86_400_000;
  const active = usage ? usage.usage.filter((u) => u.lastSeenAt && usage.now - u.lastSeenAt < 7 * day).length : null;
  const quiet = usage ? usage.usage.filter((u) => !u.lastSeenAt || usage.now - u.lastSeenAt > 3 * day).length : null;
  const paid = usage ? list.approved.filter((a) => (a.paidUntil ?? 0) > usage.now).length : null;
  const tiles = [
    { label: "Waiting to be let in", value: list.waiting.length },
    { label: "Let in", value: list.approved.length },
    { label: "Used it in the last 7 days", value: active },
    { label: "Quiet 3+ days or never opened", value: quiet },
    { label: "Paying now", value: paid },
  ];
  return (
    <>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-2xl font-semibold tabular-nums">{t.value ?? "…"}</div>
            <div className="text-xs text-ink-3">{t.label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-3">The People tab shows each person&apos;s usage. Red means quiet 3+ days: worth a nudge.</p>
      <Funnel rows={usage?.steps ?? null} count={count} />
    </>
  );
}

/** How far the people you let in have got. */
function Funnel({ rows, count }: { rows: { step: string; people: number }[] | null; count: () => Promise<void> }) {
  return (
    <section className="mt-10">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-medium text-ink-2">How far people get</h2>
        <CountButton count={count} done={!!rows} />
      </div>
      {rows && (
        <ol className="grid gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.step} className="flex max-w-sm justify-between border-b border-line py-1.5">
              <span>{r.step}</span>
              <span className="tabular-nums">{r.people}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A mailto: link for a "you're in" note, opened in your own email app. Several people go in Bcc, hidden from each other. */
function welcomeEmail(to: string[]) {
  const subject = "You're in: JobPipe";
  const body = `Hi,

You're off the JobPipe waitlist. Sign in at https://jobpipe.in with ${to.length === 1 ? to[0] : "the email you signed up with"} and you'll go straight in.

Upload your CV, pick the roles you want, and it'll find and score jobs for you.
`;
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return to.length === 1 ? `mailto:${encodeURIComponent(to[0])}?${params}` : `mailto:?bcc=${to.map(encodeURIComponent).join(",")}&${params}`;
}

/** A mailto: link carrying someone's new password, opened in your own email app. */
function passwordEmail(to: string, password: string) {
  const subject = "Your new JobPipe password";
  const body = `Hi,

Here's a new password for JobPipe: ${password}

Sign in at https://jobpipe.in with ${to} and this password.
`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
