import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResumeDoc } from "@/components/ResumeDoc";
import { PrintButton } from "@/components/ui";
import { getJob } from "@/lib/store";

// The page title becomes the PDF's file name when you choose "Save as PDF".
export async function generateMetadata({ params }: PageProps<"/jobs/[id]/resume">): Promise<Metadata> {
  const job = await getJob((await params).id);
  return { title: job?.pack ? `${job.pack.resume.name} CV ${job.company}` : "CV" };
}

export default async function TailoredResume({ params }: PageProps<"/jobs/[id]/resume">) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job?.pack) notFound();
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="no-print flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link href={`/jobs/${job.id}`} className="text-sm text-ink-3 hover:text-ink">
          ← {job.title} at {job.company}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">In the print window, pick &quot;Save as PDF&quot; and turn off headers and footers.</span>
          <PrintButton />
        </div>
      </div>
      {job.pack.unverified.length > 0 && (
        <p className="no-print w-full max-w-[210mm] rounded-lg bg-warn/10 p-3 text-sm text-warn">
          Check before sending: {job.pack.unverified.join(", ")} {job.pack.unverified.length === 1 ? "isn't" : "aren't"} in your master CV.
        </p>
      )}
      <ResumeDoc r={job.pack.resume} />
    </div>
  );
}
