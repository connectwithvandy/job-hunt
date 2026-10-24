"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Loading } from "@/components/Loading";
import { ResumeDoc } from "@/components/ResumeDoc";
import { TailoredEditor } from "@/components/ResumeFields";
import { PrintButton } from "@/components/ui";
import { downloadDocx } from "@/lib/docx";
import { logoMap } from "@/lib/logos";

export default function TailoredResume() {
  const { id } = useParams<{ id: string }>();
  const me = useQuery(api.users.me);
  const all = useQuery(api.users.resumes);
  const data = useQuery(api.jobs.get, { jobId: id as Id<"jobs"> });
  const pack = data?.job.pack;

  // The page title becomes the PDF's file name when you choose "Save as PDF".
  useEffect(() => {
    if (pack && data) document.title = `${pack.resume.name} CV ${data.job.company}`;
  }, [pack, data]);

  if (!me || data === undefined) return <Loading />;
  if (!data || !pack) {
    return (
      <div className="card mx-auto mt-12 max-w-xl p-8 text-ink-2">
        No tailored CV for this job yet. <Link className="underline" href={`/jobs/${id}`}>Back to the job</Link>
      </div>
    );
  }
  const { job } = data;
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="no-print flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link href={`/jobs/${job._id}`} className="text-sm text-ink-3 hover:text-ink">
          ← {job.title} at {job.company}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">In the print window, pick &quot;Save as PDF&quot; and turn off headers and footers.</span>
          <PrintButton />
          <button className="btn btn-ghost btn-sm" onClick={() => void downloadDocx(pack.resume, `${pack.resume.name} CV ${job.company}`)}>
            Download Word
          </button>
        </div>
      </div>
      {pack.unverified.length > 0 && (
        <p className="no-print w-full max-w-[210mm] rounded-lg bg-warn/10 p-3 text-sm text-warn">
          Check before sending: {pack.unverified.join(", ")} {pack.unverified.length === 1 ? "isn't" : "aren't"} in your master CV.
        </p>
      )}
      <div className="max-w-full overflow-x-auto">
        <ResumeDoc r={pack.resume} photoUrl={me.photoUrl} logos={logoMap((all ?? []).map((m) => m.resume))} />
      </div>
      <details className="no-print card w-full max-w-[210mm] p-6">
        <summary className="cursor-pointer font-medium">Edit this CV</summary>
        <p className="mb-4 mt-2 text-sm text-ink-2">Changes show in the CV above, the PDF and the Word file. Numbers are re-checked against your CVs when you save.</p>
        <TailoredEditor key={pack.createdAt} jobId={job._id} resume={pack.resume} />
      </details>
    </div>
  );
}
