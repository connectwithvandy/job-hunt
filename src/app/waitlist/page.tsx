"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { PageHead } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { ActionButton } from "@/components/ui";

export default function WaitlistAdmin() {
  const me = useQuery(api.users.me);
  const list = useQuery(api.access.list, me?.isOwner ? {} : "skip");
  const setApproved = useMutation(api.access.setApproved);
  if (!me) return <Loading />;
  if (!me.isOwner) return <p className="text-ink-2">Only the owner can see the waitlist.</p>;
  if (!list) return <Loading />;

  const row = (a: Doc<"access">, approve: boolean) => (
    <li key={a._id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
      <div>
        <div className="font-medium">{a.email || "No email"}</div>
        <div className="text-xs text-ink-3">Signed up {new Date(a._creationTime).toLocaleDateString()}</div>
      </div>
      <ActionButton size="sm" variant={approve ? "primary" : "ghost"} run={async () => {
          if (!approve && !window.confirm(`Remove ${a.email}'s access? Their saved jobs stay, but they can't use JobPipe.`)) return;
          await setApproved({ accessId: a._id, approved: approve });
          // JobPipe can't send email itself, so open yours with the note ready to send.
          if (approve && a.email) window.location.href = welcomeEmail(a.email);
        }}>
        {approve ? "Let in" : "Remove access"}
      </ActionButton>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Waitlist" sub="People who signed up. They can't use JobPipe, or spend your AI credits, until you let them in. Letting someone in opens your email app with a note to tell them." />
      <h2 className="mb-2 text-sm font-medium text-ink-2">Waiting ({list.waiting.length})</h2>
      {list.waiting.length ? <ul className="mb-10">{list.waiting.map((a) => row(a, true))}</ul> : <p className="mb-10 text-sm text-ink-3">Nobody waiting.</p>}
      <h2 className="mb-2 text-sm font-medium text-ink-2">Let in ({list.approved.length})</h2>
      {list.approved.length ? <ul>{list.approved.map((a) => row(a, false))}</ul> : <p className="text-sm text-ink-3">Nobody yet.</p>}
    </div>
  );
}

/** A mailto: link for a "you're in" note, opened in your own email app. */
function welcomeEmail(to: string) {
  const subject = "You're in: JobPipe";
  const body = `Hi,

You're off the JobPipe waitlist. Sign in at https://myjobpipe.vercel.app with ${to} and you'll go straight in.

Upload your CV, pick the roles you want, and it'll find and score jobs for you.
`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
