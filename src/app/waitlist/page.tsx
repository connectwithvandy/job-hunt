"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PageHead } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { ActionButton } from "@/components/ui";

export default function WaitlistAdmin() {
  const me = useQuery(api.users.me);
  const list = useQuery(api.access.list, me?.isOwner ? {} : "skip");
  const feedback = useQuery(api.feedback.list, me?.isOwner ? {} : "skip");
  const setApproved = useMutation(api.access.setApproved);
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
          <div className="font-medium">{a.email || "No email"}</div>
          <div className="text-xs text-ink-3">Signed up {new Date(a._creationTime).toLocaleDateString()}</div>
        </div>
      </label>
      <div className="flex flex-wrap items-center gap-2">
      <ActionButton size="sm" variant="ghost" run={async () => {
          if (!window.confirm(`Give ${a.email} a new password? Their old one stops working and they're signed out.`)) return;
          setReset(await resetPassword({ accessId: a._id }));
        }}>
        Reset password
      </ActionButton>
      <ActionButton size="sm" variant={approve ? "primary" : "ghost"} run={async () => {
          if (!approve && !window.confirm(`Remove ${a.email}'s access? Their saved jobs stay, but they can't use JobPipe.`)) return;
          await setApproved({ accessId: a._id, approved: approve });
          // JobPipe can't send email itself, so open yours with the note ready to send.
          if (approve && a.email) window.location.href = welcomeEmail([a.email]);
        }}>
        {approve ? "Let in" : "Remove access"}
      </ActionButton>
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Waitlist" sub="People who signed up. They can't use JobPipe, or spend your AI credits, until you let them in. Letting someone in opens your email app with a note to tell them." />
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
              // One note to everyone, each hidden from the others.
              if (emails.length) window.location.href = welcomeEmail(emails);
            }}
          >
            Let in {picked.size} {picked.size === 1 ? "person" : "people"}
          </ActionButton>
        )}
      </div>
      {list.waiting.length ? <ul className="mb-10">{list.waiting.map((a) => row(a, true))}</ul> : <p className="mb-10 text-sm text-ink-3">Nobody waiting.</p>}
      <h2 className="mb-2 text-sm font-medium text-ink-2">Let in ({list.approved.length})</h2>
      {list.approved.length ? <ul>{list.approved.map((a) => row(a, false))}</ul> : <p className="text-sm text-ink-3">Nobody yet.</p>}
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
    </div>
  );
}

/** A mailto: link for a "you're in" note, opened in your own email app. Several people go in Bcc, hidden from each other. */
function welcomeEmail(to: string[]) {
  const subject = "You're in: JobPipe";
  const body = `Hi,

You're off the JobPipe waitlist. Sign in at https://myjobpipe.vercel.app with ${to.length === 1 ? to[0] : "the email you signed up with"} and you'll go straight in.

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

Sign in at https://myjobpipe.vercel.app with ${to} and this password.
`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
