"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { STATUS_LABELS } from "../../../convex/lib/defaults";
import { CompanyMark, PageHead, ScorePill, TrackTag, bestScore, jobTrackKey, timeAgo } from "@/components/bits";
import { AddJob, FindJobs } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton } from "@/components/ui";
import { applyFilters, FILTERS } from "@/lib/jobFilters";
import { inInr, useInrRates } from "@/lib/money";
import { REGIONS, regionsOf } from "@/lib/regions";

export default function JobsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Jobs />
    </Suspense>
  );
}

function Jobs() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const rates = useInrRates();
  const [now] = useState(() => Date.now());
  const track = params.get("track");
  const show = params.get("show");
  const region = params.get("region");
  const me = useQuery(api.users.me);
  const jobs = useQuery(api.jobs.list);
  const scoreJobs = useAction(api.agent.scoreJobs);
  if (!me || !jobs) return <Loading />;
  const trackByKey = new Map(me.tracks.map((t) => [t.key, t]));

  // New jobs posted (or found) over 45 days ago are likely filled; they move to their own chip.
  const isOld = (j: (typeof jobs)[number]) => j.status === "new" && now - (j.postedAt ? Date.parse(j.postedAt) : j._creationTime) > 45 * 86_400_000;
  const oldCount = jobs.filter(isOld).length;
  const inView = jobs
    .filter((j) => (show === "hidden" ? j.status === "dismissed" : show === "old" ? isOld(j) : j.status !== "dismissed" && !isOld(j)))
    .filter((j) => !track || jobTrackKey(j) === track);
  // Region counts follow the other filters, so each chip shows what clicking it would leave.
  const filtered = applyFilters(inView, params);
  const regionCounts = new Map<string, number>();
  for (const j of filtered) for (const r of regionsOf(j)) regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
  const visible = filtered
    .filter((j) => !region || regionsOf(j).includes(region as never))
    .sort((a, b) => (bestScore(b)?.score ?? -1) - (bestScore(a)?.score ?? -1) || b._creationTime - a._creationTime);
  const unscored = visible.filter((j) => !j.scores?.length).map((j) => j._id);
  const batch = unscored.slice(0, 12);

  // Keep the other filters when one changes.
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const q = next.toString();
    return q ? `/jobs?${q}` : "/jobs";
  };
  const filtersOn = params.has("q") || FILTERS.some((f) => params.has(f.key));
  const clearFilters = () => {
    setQ("");
    router.replace(hrefWith({ q: null, ...Object.fromEntries(FILTERS.map((f) => [f.key, null])) }), { scroll: false });
  };
  const chip = (href: string, label: React.ReactNode, active: boolean) => (
    <Link key={href} href={href} className={`rounded-full border px-3 py-1 text-sm ${active ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead title="Jobs" sub="Every role you're considering, sorted by how well it fits your best role." />

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <FindJobs tracks={me.tracks} />
        <AddJob />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(hrefWith({ track: null, show: null }), "All roles", !track && show !== "hidden")}
        {me.tracks.map((t) =>
          chip(
            hrefWith({ track: t.key, show: null }),
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>,
            track === t.key,
          ),
        )}
        {chip(hrefWith({ track: null, show: "hidden" }), "Not for me", show === "hidden")}
        {oldCount > 0 && chip(hrefWith({ track: null, show: "old" }), `Older than 45 days · ${oldCount}`, show === "old")}
        <span className="flex-1" />
        {batch.length > 0 && (
          <ActionButton
            run={async () => {
              const { scored, failed } = await scoreJobs({ jobIds: batch });
              return failed ? `Scored ${scored}, ${failed} failed. Try those again.` : `Scored ${scored}.`;
            }}
            pending={`Scoring ${batch.length} jobs…`}
            variant="ghost"
            size="sm"
          >
            Score {batch.length} unscored {unscored.length > batch.length ? `of ${unscored.length}` : ""}
          </ActionButton>
        )}
      </div>

      {inView.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="label mr-1">Region</span>
          {chip(hrefWith({ region: null }), `Everywhere · ${filtered.length}`, !region)}
          {REGIONS.filter((r) => regionCounts.get(r.key) || region === r.key).map((r) =>
            chip(hrefWith({ region: r.key }), `${r.label} · ${regionCounts.get(r.key) ?? 0}`, region === r.key),
          )}
        </div>
      )}

      {inView.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            className="field !w-56 !py-1.5 text-sm"
            placeholder="Search title or company"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              router.replace(hrefWith({ q: e.target.value.trim() || null }), { scroll: false });
            }}
          />
          {FILTERS.map((f) => (
            <select
              key={f.key}
              aria-label={f.label}
              className={`field !w-auto !py-1.5 text-sm ${params.get(f.key) ? "!border-accent" : ""}`}
              value={params.get(f.key) ?? ""}
              onChange={(e) => router.replace(hrefWith({ [f.key]: e.target.value || null }), { scroll: false })}
            >
              <option value="">{f.label}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {filtersOn && (
            <button className="text-sm text-ink-3 underline hover:text-ink" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <span className="ml-auto text-sm text-ink-3">
            {visible.length} of {inView.length}
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-ink-2">{inView.length ? "No jobs match these filters." : "No jobs here yet. Search above, or paste a job description you saw."}</div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {visible.map((j) => {
            const best = bestScore(j);
            return (
              <li key={j._id}>
                <Link href={`/jobs/${j._id}`} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-soft">
                  <CompanyMark job={j} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{j.title}</span>
                      <span className="text-sm text-ink-2">{j.company}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {j.location}
                      {j.postedAt ? ` · ${timeAgo(j.postedAt)}` : ""}
                      {j.salary ? ` · ${inInr(j.salary, rates) ?? j.salary}` : ""}
                      {j.status !== "new" ? ` · ${STATUS_LABELS[j.status]}` : ""}
                    </div>
                    {best && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{best.reason}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <ScorePill score={best?.score} />
                    <TrackTag track={trackByKey.get(jobTrackKey(j) ?? "")} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
