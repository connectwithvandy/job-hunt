"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { DirectNote, EmailDraft, HiringContacts, OutreachCard } from "@/components/job-client";
import { Loading } from "@/components/Loading";

type Show = "todo" | "waiting" | "all";

export default function Messages() {
  const rows = useQuery(api.jobs.messages);
  const [show, setShow] = useState<Show>("todo");
  if (!rows) return <Loading />;

  const counts = { todo: 0, waiting: 0, all: rows.length };
  const kind = (r: (typeof rows)[number]): Show => {
    const asked = r.outreach.filter((o) => o.status !== "draft");
    const drafts = r.outreach.filter((o) => o.status === "draft");
    if (drafts.length || (r.directNote && !asked.length)) return "todo";
    if (asked.some((o) => o.status === "sent")) return "waiting";
    return "all";
  };
  for (const r of rows) {
    const k = kind(r);
    if (k !== "all") counts[k]++;
  }
  const visible = rows.filter((r) => show === "all" || kind(r) === show);

  const tab = (key: Show, label: string) => (
    <button
      key={key}
      onClick={() => setShow(key)}
      className={`rounded-full border px-3 py-1 text-sm ${show === key ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}
    >
      {label} · {counts[key]}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead title="Messages" sub="Every note, email and referral ask you've written, across all your jobs. Edit, copy and send from here." />
      <div className="mb-5 flex flex-wrap gap-2">
        {tab("todo", "To send")}
        {tab("waiting", "Waiting for a reply")}
        {tab("all", "All")}
      </div>
      {visible.length === 0 ? (
        <div className="card p-10 text-center text-ink-2">
          {rows.length ? "Nothing here." : "No messages yet. Open a job and press \"Write my CV and cover letter\" to get a LinkedIn note and an email for it."}
        </div>
      ) : (
        <ul className="space-y-5">
          {visible.map((r) => (
            <li key={r._id} className="card space-y-4 p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/jobs/${r._id}`} className="font-medium hover:underline">
                  {r.title} <span className="text-ink-2">at {r.company}</span>
                </Link>
                <span className="text-xs text-ink-3">{r.status === "new" ? "Not applied yet" : r.status}</span>
              </div>
              {r.directNote && (
                <>
                  <div>
                    <div className="label mb-2">Hiring manager or HR</div>
                    <HiringContacts jobId={r._id} contacts={r.hiringContacts} note={r.directNote} emailSubject={r.emailSubject} email={r.email} />
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
          ))}
        </ul>
      )}
    </div>
  );
}
