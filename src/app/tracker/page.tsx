import Link from "next/link";
import { CompanyMark, PageHead, jobTrackId, timeAgo } from "@/components/bits";
import { StatusSelect } from "@/components/job-client";
import { PIPELINE } from "@/lib/defaults";
import { getJobs, getTracks } from "@/lib/store";

export default async function Tracker() {
  const [jobs, tracks] = await Promise.all([getJobs(), getTracks()]);
  const color = new Map(tracks.map((t) => [t.id, t.color]));
  const total = jobs.filter((j) => PIPELINE.some((p) => p.status === j.status)).length;

  return (
    <div>
      <PageHead title="Tracker" sub={total ? `${total} applications in motion. Change a card's status to move it.` : "Applications show up here once you start one."} />
      <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-6 md:-mx-12 md:px-12">
        {PIPELINE.map((col) => {
          const cards = jobs.filter((j) => j.status === col.status).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          return (
            <section key={col.status} className="w-72 shrink-0">
              <h2 className="mb-3 flex items-baseline justify-between px-1">
                <span className="font-medium">{col.label}</span>
                <span className="text-sm text-ink-3 tabular-nums">{cards.length}</span>
              </h2>
              <div className="min-h-32 space-y-3 rounded-2xl bg-soft p-2">
                {cards.map((j) => {
                  const asked = j.outreach.filter((o) => o.status !== "draft").length;
                  const warm = j.outreach.filter((o) => o.status === "replied" || o.status === "referred").length;
                  return (
                    <div key={j.id} className="card relative overflow-hidden p-4">
                      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color.get(jobTrackId(j) ?? "") ?? "transparent" }} />
                      <Link href={`/jobs/${j.id}`} className="flex gap-3">
                        <CompanyMark job={j} size={28} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-snug">{j.title}</div>
                          <div className="text-xs text-ink-2">{j.company}</div>
                        </div>
                      </Link>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-3">
                        <span>
                          {j.appliedAt ? `Applied ${timeAgo(j.appliedAt)}` : `Updated ${timeAgo(j.updatedAt)}`}
                          {asked ? ` · ${warm}/${asked} warm` : ""}
                        </span>
                        <StatusSelect jobId={j.id} status={j.status} />
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
