"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { PIPELINE } from "../../../convex/lib/defaults";
import { CompanyMark, PageHead, jobTrackKey, timeAgo } from "@/components/bits";
import { GmailSync } from "@/components/forms";
import { StatusSelect } from "@/components/job-client";
import { Loading } from "@/components/Loading";

export default function Tracker() {
  const me = useQuery(api.users.me);
  const jobs = useQuery(api.jobs.list);
  if (!me || !jobs) return <Loading />;
  const color = new Map(me.tracks.map((t) => [t.key, t.color]));
  const total = jobs.filter((j) => PIPELINE.some((p) => p.status === j.status)).length;

  return (
    <div>
      <PageHead title="Applications" sub={total ? `${total} applications in motion. Change a card's status to move it.` : "Applications show up here once you start one."} />
      <div className="mb-6">
        <GmailSync />
      </div>
      <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-6 md:-mx-12 md:px-12">
        {PIPELINE.map((col) => {
          const cards = jobs.filter((j) => j.status === col.status).sort((a, b) => b.updatedAt - a.updatedAt);
          return (
            <section key={col.status} className="w-72 shrink-0">
              <h2 className="mb-3 flex items-baseline justify-between px-1">
                <span className="font-medium">{col.label}</span>
                <span className="text-sm tabular-nums text-ink-3">{cards.length}</span>
              </h2>
              <div className="min-h-32 space-y-3 rounded-2xl bg-soft p-2">
                {cards.map((j) => {
                  const asked = j.outreach.filter((o) => o.status !== "draft").length;
                  const warm = j.outreach.filter((o) => o.status === "replied" || o.status === "referred").length;
                  return (
                    <div key={j._id} className="card relative overflow-hidden p-4">
                      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color.get(jobTrackKey(j) ?? "") ?? "transparent" }} />
                      <Link href={`/jobs/${j._id}`} className="flex gap-3">
                        <CompanyMark job={j} size={28} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-snug">{j.title}</div>
                          <div className="text-xs text-ink-2">{j.company}</div>
                        </div>
                      </Link>
                      {j.hasSent && (
                        <p className="mt-2 text-xs text-ink-2">
                          What you sent:{" "}
                          <Link className="underline" href={`/jobs/${j._id}/resume?sent=1`}>CV</Link> ·{" "}
                          <Link className="underline" href={`/jobs/${j._id}/letter?sent=1`}>cover letter</Link>
                        </p>
                      )}
                      {j.lastEmail && (
                        <p className="mt-2 truncate text-xs text-ink-2" title={`${j.lastEmail.from}: ${j.lastEmail.subject}`}>
                          Email {timeAgo(j.lastEmail.at)}: {j.lastEmail.subject}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-3">
                        <span>
                          {j.appliedAt ? `Applied ${timeAgo(j.appliedAt)}` : `Updated ${timeAgo(j.updatedAt)}`}
                          {asked ? ` · ${warm}/${asked} warm` : ""}
                        </span>
                        <StatusSelect jobId={j._id} status={j.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
