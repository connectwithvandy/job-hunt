"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState, useTransition } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PageHead } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { ActionButton, attempt, Feedback, type ActionState } from "@/components/ui";

export default function WaitlistAdmin() {
  const me = useQuery(api.users.me);
  const list = useQuery(api.access.list, me?.isOwner ? {} : "skip");
  const feedback = useQuery(api.feedback.list, me?.isOwner ? {} : "skip");
  const reviews = useQuery(api.cvReviews.list, me?.isOwner ? {} : "skip");
  const errors = useQuery(api.errors.recent, me?.isOwner ? {} : "skip");
  const surveys = useQuery(api.surveys.list, me?.isOwner ? {} : "skip");
  const setApproved = useMutation(api.access.setApproved);
  const setRejected = useMutation(api.access.setRejected);
  const approveMany = useMutation(api.access.approveMany);
  const resetPassword = useAction(api.access.resetPassword);
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);
  const [picked, setPicked] = useState<Set<Id<"access">>>(new Set());
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
        </div>
      </label>
      <div className="flex flex-wrap items-center gap-2">
      <ActionButton size="sm" variant="ghost" run={async () => {
          if (!window.confirm(`Give ${a.email} a new password? Their old one stops working and they're signed out.`)) return;
          setReset(await resetPassword({ accessId: a._id }));
        }}>
        Reset password
      </ActionButton>
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
        title="Waitlist"
        sub={`People who signed up. They can't use JobPipe, or spend your AI credits, until you let them in. ${
          list.emailOn
            ? "Letting someone in sends them a personal \"you're in\" email from hello@jobpipe.in."
            : "Letting someone in opens your email app with a note to tell them. (Automatic email is off until RESEND_API_KEY is set.)"
        }`}
      />
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
      <h2 className="mb-2 text-sm font-medium text-ink-2">Let in ({list.approved.length})</h2>
      {list.approved.length ? <ul>{list.approved.map((a) => row(a, false))}</ul> : <p className="text-sm text-ink-3">Nobody yet.</p>}
      <h2 className="mt-10 mb-2 text-sm font-medium text-ink-2">Free CV reviews ({reviews?.length ?? 0})</h2>
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
      <Funnel />
      <SurveyAnswers rows={surveys} />
      <h2 className="mt-10 mb-2 text-sm font-medium text-ink-2">Errors people hit ({errors?.length ?? 0})</h2>
      <p className="mb-2 text-xs text-ink-3">New ones are emailed to you once an hour.</p>
      {errors?.length ? (
        <ul>
          {errors.map((e) => (
            <li key={e._id} className="border-b border-line py-3 text-sm">
              <p className="whitespace-pre-wrap break-words font-mono text-xs">{e.message}</p>
              <p className="mt-1 text-xs text-ink-3">
                {e.email || "signed out"} · {e.page} · {new Date(e._creationTime).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">None.</p>
      )}
    </div>
  );
}

const SURVEY_LABELS = { found_jobs: "Day 2 · finding good jobs?", recommend: "Day 6 · recommend, 0 to 10", interviews: "Monthly · interviews yet?" } as const;

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

/** How far the people you let in have got. Counted only when you click, because it reads everyone's jobs. */
function Funnel() {
  const count = useAction(api.stats.funnel);
  const [rows, setRows] = useState<{ step: string; people: number }[] | null>(null);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <section className="mt-10">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-medium text-ink-2">How far people get</h2>
        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setState(await attempt(async () => setRows(await count({})))))}>
          {pending ? "Counting…" : rows ? "Count again" : "Count"}
        </button>
        <Feedback state={state} />
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
