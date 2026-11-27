"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Loading } from "@/components/Loading";
import { EmptyPack } from "@/components/job-client";
import { PrintButton } from "@/components/ui";
import { downloadLetterDocx } from "@/lib/docx";

/** The cover letter as a document, to save as a PDF or Word file and upload to an application form. */
export default function CoverLetterDoc() {
  const { id } = useParams<{ id: string }>();
  const data = useQuery(api.jobs.get, { jobId: id as Id<"jobs"> });
  // ?sent=1 shows the letter frozen when you applied.
  const sent = useSearchParams().get("sent") ? data?.job.sent : undefined;
  const pack = sent ? { ...data!.job.pack!, resume: sent.resume, coverLetter: sent.coverLetter } : data?.job.pack;

  // The page title becomes the PDF's file name when you choose "Save as PDF".
  const fileName = pack && data ? `${pack.resume.name} Cover Letter ${data.job.company}` : "";
  useEffect(() => {
    if (fileName) document.title = fileName;
  }, [fileName]);

  if (data === undefined) return <Loading />;
  if (!data || !pack) {
    return (
      <EmptyPack jobId={id as Id<"jobs">} kind="letter" job={data?.job} />
    );
  }
  const { job } = data;
  const r = pack.resume;
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="no-print flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link href={`/jobs/${job._id}`} className="btn-text -ml-1 inline-flex min-h-11 max-w-full items-center gap-1">
          <span aria-hidden>←</span>
          <span className="truncate">Back to {job.company}</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">In the print window, pick &quot;Save as PDF&quot; and turn off headers and footers.</span>
          <PrintButton />
          <button className="btn btn-ghost btn-sm" onClick={() => void downloadLetterDocx(r, pack.coverLetter, `${r.name} Cover Letter ${job.company}`)}>
            Download Word
          </button>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <div className="letter">
          <h1>{r.name}</h1>
          <div className="contact">
            {[r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin].filter(Boolean).map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          {pack.coverLetter.trim().split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
