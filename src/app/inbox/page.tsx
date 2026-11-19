"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CompanyMark, timeAgo } from "@/components/bits";
import { JobEmails } from "@/components/job-client";
import { Loading } from "@/components/Loading";

/**
 * Every company that has written to you, like Dreamwork's Messages (19 Nov): the list on the left, the
 * conversation on the right with a drafted reply. Built from the emails Gmail already matched to your jobs.
 */
export default function InboxPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inbox />
    </Suspense>
  );
}

const STAGE: Record<string, string> = { applied: "Received", screening: "Recruiter wrote", interview: "Interview", offer: "Offer", rejected: "No", other: "Email" };

function Inbox() {
  const me = useQuery(api.users.me);
  const jobs = useQuery(api.jobs.list);
  const gmail = useQuery(api.google.status);
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  if (!me || !jobs) return <Loading />;
  const threads = jobs.filter((j) => j.lastEmail).sort((a, b) => b.lastEmail!.at - a.lastEmail!.at);
  const words = q.trim().toLowerCase();
  const shown = threads.filter((j) => !words || `${j.company} ${j.title}`.toLowerCase().includes(words));
  const picked = (params.get("job") as Id<"jobs"> | null) ?? shown[0]?._id ?? null;
  const job = threads.find((j) => j._id === picked);
  const account = gmail?.email || me.email;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Messages</h1>
      {threads.length === 0 ? (
        <div className="card p-6 text-sm text-ink-2">
          No emails from companies yet. {gmail?.email ? "Replies to your applications show up here by themselves." : "Connect Gmail and recruiter replies show up here by themselves."}{" "}
          {!gmail?.email && (
            <Link href="/connect" className="underline">
              Connect Gmail
            </Link>
          )}
        </div>
      ) : (
        <div className="card grid min-h-[60vh] overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="border-b border-line md:border-r md:border-b-0">
            <div className="p-3">
              <input className="field !py-2 text-sm" placeholder="Search company or role" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="max-h-[70vh] overflow-y-auto">
              {shown.map((j) => {
                const e = j.lastEmail!;
                const waiting = !e.repliedAt && e.stage !== "applied";
                return (
                  <li key={j._id}>
                    <button
                      type="button"
                      onClick={() => router.replace(`/inbox?job=${j._id}`, { scroll: false })}
                      className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-soft ${j._id === picked ? "bg-soft" : ""}`}
                    >
                      <CompanyMark job={j} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${waiting ? "font-semibold" : "font-medium"}`}>{j.company}</span>
                          <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(new Date(e.at).toISOString())}</span>
                        </span>
                        <span className="block truncate text-xs text-ink-2">{j.title}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {STAGE[e.stage] ?? "Email"} · {e.subject}
                        </span>
                      </span>
                      {waiting && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Needs an answer" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <section className="min-w-0 p-5">
            {job ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CompanyMark job={job} size={40} />
                    <div>
                      <div className="font-medium">{job.company}</div>
                      <div className="text-sm text-ink-2">{job.title}</div>
                    </div>
                  </div>
                  <Link href={`/jobs/${job._id}`} className="btn btn-ghost btn-sm">
                    Open the job
                  </Link>
                </div>
                <Thread jobId={job._id} company={job.company} account={account} />
              </>
            ) : (
              <p className="text-sm text-ink-3">Pick a conversation on the left.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Thread({ jobId, company, account }: { jobId: Id<"jobs">; company: string; account: string }) {
  const emails = useQuery(api.inbox.thread, { jobId });
  if (!emails) return <div className="h-40 animate-pulse rounded-xl bg-soft" />;
  if (!emails.length) return <p className="text-sm text-ink-3">The email itself wasn&apos;t kept, only its subject. Open the job for more.</p>;
  return <JobEmails emails={emails} company={company} account={account} />;
}
