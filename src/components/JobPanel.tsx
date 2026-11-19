"use client";

// The job you clicked on the Jobs list, shown beside the list (wide screens): the essentials, the fit, the
// description, and the way into the full page where the CV, referrals and prep live.
import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CompanyMark, FitBadge, timeAgo } from "@/components/bits";
import { payText, useInrRates } from "@/lib/money";
import { payEstimateText } from "../../convex/lib/payEstimate";

export function JobPanel({ jobId, onClose }: { jobId: Id<"jobs">; onClose: () => void }) {
  const data = useQuery(api.jobs.get, { jobId });
  const rates = useInrRates();
  const [copied, setCopied] = useState(false);
  const [more, setMore] = useState(false);
  if (data === undefined) return <div className="card h-96 animate-pulse" />;
  if (data === null) return <div className="card p-6 text-sm text-ink-2">This job isn&apos;t in your list any more.</div>;
  const { job } = data;
  const best = [...(job.scores ?? [])].sort((a, b) => b.score - a.score)[0];
  const pay = payText(job.salary, rates);
  const link = job.sourceUrl || job.url || "";
  const description = job.description ?? "";
  const share = async () => {
    const text = `${job.title} at ${job.company}`;
    try {
      if (navigator.share && link) await navigator.share({ title: text, url: link });
      else {
        await navigator.clipboard.writeText(link ? `${text}: ${link}` : text);
        setCopied(true);
      }
    } catch {}
  };
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
        <button type="button" aria-label="Close" className="text-ink-3 hover:text-ink" onClick={onClose}>
          ✕
        </button>
        <span className="min-w-0 flex-1 truncate font-medium">
          {job.title} <span className="text-ink-3">· {job.company}</span>
        </span>
        <Link href={`/jobs/${job._id}`} className="shrink-0 rounded-full border border-line px-3 py-1 text-ink-2 hover:text-ink">
          Open full page
        </Link>
      </div>
      <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto p-5">
        <div className="rounded-xl border border-line p-5">
          <CompanyMark job={job} size={48} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-medium">{job.company}</span>
            {job.location && <span className="rounded-full bg-soft px-2 py-0.5 text-xs text-ink-2">{job.location}</span>}
          </div>
          <h2 className="display mt-2 text-2xl leading-tight">{job.title}</h2>
          <p className="mt-1 text-sm text-ink-3">{job.postedAt ? `Posted ${timeAgo(job.postedAt)}` : `Found ${timeAgo(new Date(job._creationTime).toISOString())}`}</p>
          <p className="mt-3 text-lg">
            {pay ||
              (payEstimateText(job) ? (
                <>
                  {payEstimateText(job)} <span className="text-sm text-ink-3" title="Our rough guess from the job title and city, before incentives. The company hasn't listed pay.">estimate</span>
                </>
              ) : (
                <span className="text-ink-3">Salary not listed</span>
              ))}
          </p>
        </div>

        <div className="space-y-2">
          <Link href={`/jobs/${job._id}`} className="btn btn-primary w-full justify-center py-3 text-base">
            {job.pack ? "Open my CV and apply" : "Write my CV and apply"}
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-ghost justify-center" onClick={() => void share()}>
              {copied ? "Link copied" : "Share"}
            </button>
            {link ? (
              <a className="btn btn-ghost justify-center" href={link} target="_blank" rel="noopener noreferrer">
                Original ↗
              </a>
            ) : (
              <span className="btn btn-ghost justify-center opacity-50">No link</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="label">Is it a fit?</div>
            <FitBadge job={job} size={36} />
          </div>
          {best ? (
            <>
              <p className="text-sm text-ink-2">{best.reason}</p>
              {best.gaps?.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
                  {best.gaps.slice(0, 3).map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-2">Open the full page and press Score for an AI read of this job against your CV.</p>
          )}
        </div>

        {description && (
          <div className="rounded-xl border border-line p-5 text-sm">
            <div className="label mb-2">About the job</div>
            <p className="whitespace-pre-line text-ink-2">{more ? description : description.slice(0, 1200)}</p>
            {description.length > 1200 && (
              <button type="button" className="mt-2 text-ink-3 underline hover:text-ink" onClick={() => setMore(!more)}>
                {more ? "Show less" : "Read the full description"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
