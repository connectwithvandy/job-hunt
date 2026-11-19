"use client";

// One job's messages (hiring-manager note and email, referral asks) and how urgent they are, shared by the
// Referrals page and anywhere else that lists what to send.
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { STATUS_LABELS } from "../../convex/lib/defaults";
import { nextFollowUp, REFERRAL_FOLLOW_UP_AFTER } from "../../convex/lib/followups";
import { DirectNote, EmailDraft, HiringContacts, OutreachCard } from "@/components/job-client";

export type MessageRow = FunctionReturnType<typeof api.jobs.messages>[number];
export type MessageKind = "todo" | "followup" | "waiting" | "done";

/** Where a job's messages stand: a follow-up is due, a note is written but not sent, sent and waiting, or settled. */
export function messageKind(r: MessageRow, now: number): MessageKind {
  const asked = r.outreach.filter((o) => o.status !== "draft");
  const drafts = r.outreach.filter((o) => o.status === "draft");
  const contacted = r.hiringContacts.filter((c) => c.sentAt);
  const due = [
    ...r.outreach.map((o) => nextFollowUp({ sentAt: o.status === "sent" ? o.sentAt : undefined, replied: false, followUps: o.followUps }, REFERRAL_FOLLOW_UP_AFTER)),
    ...r.hiringContacts.map((c) => nextFollowUp({ sentAt: c.sentAt, replied: !!c.repliedAt, followUps: c.followUps })),
  ].some((f) => f && f.dueAt <= now);
  if (due) return "followup";
  if (drafts.length || (r.directNote && !asked.length && !contacted.length)) return "todo";
  if (asked.some((o) => o.status === "sent") || contacted.some((c) => !c.repliedAt)) return "waiting";
  return "done";
}

export function MessageCard({ r }: { r: MessageRow }) {
  return (
      <li className="card space-y-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={`/jobs/${r._id}`} className="font-medium hover:underline">
            {r.title} <span className="text-ink-2">at {r.company}</span>
          </Link>
          <span className="text-xs text-ink-3">{r.status === "new" ? "Not applied yet" : (STATUS_LABELS[r.status] ?? r.status)}</span>
        </div>
        {r.directNote && (
          <>
            <div>
              <div className="label mb-2">Hiring manager or HR</div>
              <HiringContacts owner={{ jobId: r._id }} contacts={r.hiringContacts} note={r.directNote} emailSubject={r.emailSubject} email={r.email} />
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium">LinkedIn note</summary>
              <div className="mt-2">
                <DirectNote key={r.packCreatedAt} jobId={r._id} text={r.directNote} />
              </div>
            </details>
            {r.email && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Email</summary>
                <div className="mt-2">
                  <EmailDraft key={r.packCreatedAt} jobId={r._id} subject={r.emailSubject ?? ""} body={r.email} />
                </div>
              </details>
            )}
          </>
        )}
        {r.outreach.length > 0 && (
          <div className="space-y-3">
            <div className="label">Referral asks</div>
            {r.outreach.map((o) => (
              <OutreachCard key={o.contactId + o.message.length} jobId={r._id} o={o} cvName={`CV ${r.company}.pdf`} />
            ))}
          </div>
        )}
      </li>
  );
}
