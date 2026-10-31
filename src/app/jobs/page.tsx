"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STATUS_LABELS } from "../../../convex/lib/defaults";
import { CompanyMark, PageHead, QuickFitPill, ScorePill, TrackTag, bestScore, jobTrackKey, timeAgo } from "@/components/bits";
import { AddJob, FavoriteStar, FindJobs } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton, LeftToday, useLeftToday } from "@/components/ui";
import { applyFilters, FILTERS, fitFor, fitTier, inRole } from "@/lib/jobFilters";
import { inInr, payPerYearInr, useInrRates } from "@/lib/money";
import { REGIONS, regionsOf } from "@/lib/regions";

type ListJob = FunctionReturnType<typeof api.jobs.list>[number];
const byTime = (j: ListJob) => (j.postedAt ? Date.parse(j.postedAt) : j._creationTime);

/** Ways to order the list. Jobs without the thing being sorted on go last. */
/** The AI score when there is one, else the quick fit. */
const fitOrQuick = (j: ListJob, role: string | null) => {
  const fit = fitFor(j, role);
  return fit >= 0 ? fit : (j.quickFit ?? -1);
};

const SORTS = {
  // AI-scored jobs at the line or above come first, then first guesses, which run high.
  fit: {
    label: "Best fit",
    compare: (role: string | null) => (a: ListJob, b: ListJob) =>
      fitTier(fitFor(b, role)) - fitTier(fitFor(a, role)) || fitOrQuick(b, role) - fitOrQuick(a, role) || b._creationTime - a._creationTime,
  },
  pay: {
    label: "Highest pay",
    compare: (role: string | null, rates: Record<string, number>) => (a: ListJob, b: ListJob) =>
      (payPerYearInr(b.salary, rates) ?? -1) - (payPerYearInr(a.salary, rates) ?? -1) || fitFor(b, role) - fitFor(a, role),
  },
  posted: { label: "Newest posted", compare: () => (a: ListJob, b: ListJob) => byTime(b) - byTime(a) },
  added: { label: "Recently added", compare: () => (a: ListJob, b: ListJob) => b._creationTime - a._creationTime },
  company: { label: "Company A–Z", compare: () => (a: ListJob, b: ListJob) => a.company.localeCompare(b.company) },
} satisfies Record<string, { label: string; compare: (role: string | null, rates: Record<string, number>) => (a: ListJob, b: ListJob) => number }>;

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
  // With a home city set, the list opens on that city plus remote; "all" shows everywhere.
  const regionParam = params.get("region");
  const me = useQuery(api.users.me);
  const findHiringPosts = useAction(api.agent.findHiringPosts);
  const jobs = useQuery(api.jobs.list);
  const scoreJobs = useAction(api.agent.scoreJobs);
  const scoresLeft = useLeftToday("scoresLeft");
  const setStatusMany = useMutation(api.jobs.setStatusMany);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!me || !jobs) return <Loading />;
  const trackByKey = new Map(me.tracks.map((t) => [t.key, t]));
  const homeIsBlr = /bengaluru|bangalore/i.test(me.location);
  const sort = (params.get("sort") ?? "fit") as keyof typeof SORTS;
  const region = regionParam === "all" ? null : (regionParam ?? (homeIsBlr ? "blr" : null));

  // New jobs posted (or found) over 45 days ago are likely filled; they move to their own chip.
  const isOld = (j: (typeof jobs)[number]) => j.status === "new" && now - (j.postedAt ? Date.parse(j.postedAt) : j._creationTime) > 45 * 86_400_000;
  const oldCount = jobs.filter(isOld).length;
  // Applied and later live on the Tracker, so this list stays jobs you can still apply to.
  const isApplied = (j: (typeof jobs)[number]) => j.status !== "new" && j.status !== "applying" && j.status !== "dismissed";
  const appliedCount = jobs.filter(isApplied).length;
  const inView = jobs
    .filter((j) =>
      show === "hidden" ? j.status === "dismissed" : show === "old" ? isOld(j) : show === "applied" ? isApplied(j) : j.status !== "dismissed" && !isOld(j) && !isApplied(j),
    )
    // A role shows only jobs whose title matches one of its job titles, ranked by that role's score.
    .filter((j) => !track || (trackByKey.has(track) && inRole(j, trackByKey.get(track)!)));
  // Region counts follow the other filters, so each chip shows what clicking it would leave.
  const filtered = applyFilters(inView, params);
  const regionCounts = new Map<string, number>();
  for (const j of filtered) for (const r of regionsOf(j)) regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
  const visible = filtered
    .filter((j) => !region || regionsOf(j).includes(region as never))
    .sort(SORTS[sort].compare(track, rates))
    // Favourites first, each group in the order picked.
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
  const unscored = visible.filter((j) => !j.scores?.length).map((j) => j._id);
  // Never ask for more scores than today's allowance has left; the owner has no limit.
  const batch = unscored.slice(0, me.isOwner ? 12 : Math.min(12, scoresLeft ?? 12));

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

      {/* On a phone the two forms fold away, so the jobs come first. */}
      <details className="mb-6 md:hidden">
        <summary className="btn btn-ghost btn-sm cursor-pointer list-none">+ Find or add jobs</summary>
        <div className="mt-3 grid gap-4">
          <FindJobs tracks={me.tracks} />
          <AddJob />
        </div>
      </details>
      <div className="mb-8 hidden gap-4 md:grid md:grid-cols-2">
        <FindJobs tracks={me.tracks} />
        <AddJob />
      </div>
      {me.isOwner && (
        <div className="mb-8">
          <ActionButton
            run={async () => {
              const { added } = await findHiringPosts();
              return added ? `Saved ${added} ${added === 1 ? "role" : "roles"} from LinkedIn posts, each with the person who posted it.` : "No new fitting roles in last week's posts.";
            }}
            pending="Reading last week's LinkedIn posts… about two minutes"
            variant="ghost"
            size="sm"
          >
            Find &quot;we&apos;re hiring&quot; posts on LinkedIn
          </ActionButton>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(hrefWith({ track: null, show: null }), "All roles", !track && !show)}
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
        {appliedCount > 0 && chip(hrefWith({ track: null, show: "applied" }), `Applied · ${appliedCount}`, show === "applied")}
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
        <LeftToday kind="scoresLeft" label="scores" />
      </div>

      {inView.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="label mr-1">Region</span>
          {chip(hrefWith({ region: homeIsBlr ? "all" : null }), `Everywhere · ${filtered.length}`, !region)}
          {REGIONS.filter((r) => regionCounts.get(r.key) || region === r.key).map((r) =>
            chip(hrefWith({ region: homeIsBlr && r.key === "blr" ? null : r.key }), `${r.label} · ${regionCounts.get(r.key) ?? 0}`, region === r.key),
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
          <select
            aria-label="Sort"
            className="field !w-auto !py-1.5 text-sm"
            value={sort}
            onChange={(e) => router.replace(hrefWith({ sort: e.target.value === "fit" ? null : e.target.value }), { scroll: false })}
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                Sort: {v.label}
              </option>
            ))}
          </select>
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

      {picked.size > 0 && (
        <div className="card sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="font-medium">{picked.size} selected</span>
          <ActionButton
            run={async () => {
              await setStatusMany({ jobIds: [...picked] as Id<"jobs">[], status: show === "hidden" ? "new" : "dismissed" });
              setPicked(new Set());
              return show === "hidden" ? "Moved back to your list." : "Moved to Not for me.";
            }}
            variant="ghost"
            size="sm"
          >
            {show === "hidden" ? "Put back in my list" : "Not for me"}
          </ActionButton>
          {show !== "hidden" && (
            <ActionButton
              run={async () => {
                const ids = ([...picked] as Id<"jobs">[]).slice(0, 12);
                const { scored, failed } = await scoreJobs({ jobIds: ids });
                setPicked(new Set());
                return failed ? `Scored ${scored}, ${failed} failed.` : `Scored ${scored}.`;
              }}
              pending="Scoring…"
              variant="ghost"
              size="sm"
            >
              Score {Math.min(12, picked.size)}
            </ActionButton>
          )}
          <button className="text-ink-3 underline hover:text-ink" onClick={() => setPicked(new Set(visible.map((j) => j._id)))}>
            Select all {visible.length}
          </button>
          <button className="text-ink-3 underline hover:text-ink" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-ink-2">{inView.length ? "No jobs match these filters." : "No jobs here yet. Search above, or paste a job description you saw."}</div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {visible.map((j) => {
            const best = track ? j.scores?.find((s) => s.trackKey === track) : bestScore(j);
            return (
              <li key={j._id} className={`flex items-start ${picked.has(j._id) ? "bg-soft" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={`Select ${j.title}`}
                  className="ml-4 mt-6 h-4 w-4 shrink-0"
                  checked={picked.has(j._id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(j._id);
                    else next.delete(j._id);
                    setPicked(next);
                  }}
                />
                <FavoriteStar jobId={j._id} favorite={!!j.favorite} className="ml-3 mt-5 shrink-0" />
                <Link href={`/jobs/${j._id}`} className="flex min-w-0 flex-1 items-start gap-4 px-4 py-4 transition-colors hover:bg-soft">
                  <CompanyMark job={j} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{j.title}</span>
                      <span className="text-sm text-ink-2">{j.company}</span>
                      {j.status !== "new" && (
                        <span className="self-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">{STATUS_LABELS[j.status]}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {j.location}
                      {j.postedAt ? ` · ${timeAgo(j.postedAt)}` : ""}
                      {j.salary ? ` · ${inInr(j.salary, rates) ?? j.salary}` : ""}
                      {j.liveCheck?.state === "closed" && <span className="text-bad"> · Looks closed</span>}
                      {j.brief?.blocker && <span className="text-bad"> · Rules you out</span>}
                    </div>
                    {best && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{best.reason}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {best ? <ScorePill score={best.score} /> : <QuickFitPill score={j.quickFit} />}
                    <TrackTag track={trackByKey.get((track ?? jobTrackKey(j)) ?? "")} />
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
