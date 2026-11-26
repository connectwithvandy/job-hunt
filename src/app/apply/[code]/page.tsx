"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../convex/_generated/api";

// A job from the LinkedIn post. The app frame (Shell) asks visitors to sign up and set up first, so this page only
// renders for members; it then opens the job's own posting (26 Nov 2026).
export default function ApplyPage() {
  const { code } = useParams<{ code: string }>();
  const job = useQuery(api.postedJobs.get, { code });
  useEffect(() => {
    if (job) window.location.replace(job.url);
  }, [job]);
  if (job === null) return <p className="mx-auto max-w-xl py-16 text-ink-2">This job link has expired. Your new matches are on the Jobs tab.</p>;
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="text-ink-2">{job ? `Opening ${job.title} at ${job.company}…` : "Opening the job…"}</p>
      {job && (
        <a href={job.url} rel="nofollow noopener" className="btn btn-primary mt-5">
          Open the job
        </a>
      )}
    </div>
  );
}
