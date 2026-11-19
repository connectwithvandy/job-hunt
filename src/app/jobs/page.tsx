"use client";

import { stalePenalty } from "../../../convex/lib/posting";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STATUS_LABELS } from "../../../convex/lib/defaults";
import { CompanyMark, FitBadge, TrackTag, bestScore, jobTrackKey, timeAgo } from "@/components/bits";
import { AddJob, FavoriteStar, FindJobs } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton, LeftToday, useLeftToday } from "@/components/ui";
import { applyFilters, FILTERS, fitFor, fitTier, inRole, picks, togglePick } from "@/lib/jobFilters";
import { strongCompany } from "../../../convex/lib/quickFit";
import { payPerYearInr, payText, useInrRates } from "@/lib/money";
import { REGIONS, regionsOf } from "@/lib/regions";
import { sameRoleKey } from "../../../convex/lib/company";
import { ScoreTipPopup } from "@/components/ScoreTipPopup";
import { JobPanel } from "@/components/JobPanel";

type ListJob = FunctionReturnType<typeof api.jobs.list>[number];
// First guesses this low are almost never worth opening; they fold away under the list.
const WEAK_GUESS = 40;
// Scored jobs leave the "not scored" list; without this they seemed to vanish (14 Nov, new-user walk).
const MOVED = "Good fits (60+) move to the top; lower ones go to the bottom, under \"Scored below 60\".";
// Rows drawn at first; the rest wait behind "Show more" so a long list opens quickly.
const PAGE = 60;
const byTime = (j: ListJob) => (j.postedAt ? Date.parse(j.postedAt) : j._creationTime);

/** Ways to order the list. Jobs without the thing being sorted on go last. */
/** The AI score when there is one, else the quick fit: the number on the ring, so the list reads in order. */
const fitOrQuick = (j: ListJob, role: string | null) => {
  const fit = fitFor(j, role);
  return fit >= 0 ? fit : (j.quickFit ?? -1);
};
// A closed posting goes to the end of its group; age only breaks ties between equal fits. It used to be
// taken off the score, so 66% showed under 60% and ~54% under ~47% (19 Nov walk).
const closedLast = (j: ListJob) => (j.liveCheck?.state === "closed" ? 1 : 0);

/** Listed pay only; jobs that don't list pay go last in "Highest pay" (owner, 19 Nov: no guessed pay). */
function payForSort(j: ListJob, rates: Record<string, number>) {
  return payPerYearInr(j.salary, rates) ?? -1;
}

const SORTS = {
  // AI-scored jobs at the line or above come first, then first guesses, which run high.
  fit: {
    label: "Best fit",
    compare: (role: string | null) => (a: ListJob, b: ListJob) =>
      fitTier(fitFor(b, role)) - fitTier(fitFor(a, role)) ||
      closedLast(a) - closedLast(b) ||
      fitOrQuick(b, role) - fitOrQuick(a, role) ||
      stalePenalty(a) - stalePenalty(b) ||
      b._creationTime - a._creationTime,
  },
  pay: {
    label: "Highest pay",
    compare: (role: string | null, rates: Record<string, number>) => (a: ListJob, b: ListJob) =>
      payForSort(b, rates) - payForSort(a, rates) || fitFor(b, role) - fitFor(a, role),
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
  const [shown, setShown] = useState(PAGE);
  const [showWeak, setShowWeak] = useState(false);
  if (!me || !jobs) return <Loading />;
  const trackByKey = new Map(me.tracks.map((t) => [t.key, t]));
  const homeIsBlr = /bengaluru|bangalore/i.test(me.location);
  const sort = (params.get("sort") ?? "fit") as keyof typeof SORTS;
  // Several regions can be on together, like Bengaluru and Remote; "all" means everywhere.
  const regionPicks = regionParam === "all" ? [] : regionParam ? regionParam.split(",").filter(Boolean) : homeIsBlr ? ["blr"] : [];
  const region = regionPicks.length ? regionPicks.join(",") : null;

  // New jobs posted (or found) over 45 days ago are likely filled; they move to their own chip.
  // A role from a company's own careers board was live when found, so its age counts from then.
  // Closed postings join them (the morning re-check marks them): nobody should apply to those by mistake.
  // Careers-board roles count from when we found them (still live on the company's own board), but one posted
  // 6+ months ago is an evergreen listing, not a fresh role (16 Nov walk: Flyy 32 months, Datadog 10 months near the top).
  const isOld = (j: (typeof jobs)[number]) =>
    j.status === "new" &&
    (j.liveCheck?.state === "closed" ||
      now - (j.postedAt && j.source !== "careers" ? Date.parse(j.postedAt) : j._creationTime) > 45 * 86_400_000 ||
      (j.source === "careers" && !!j.postedAt && now - Date.parse(j.postedAt) > 180 * 86_400_000));
  const oldCount = jobs.filter(isOld).length;
  // Applied and later live on the Tracker, so this list stays jobs you can still apply to.
  const isApplied = (j: (typeof jobs)[number]) => j.status !== "new" && j.status !== "applying" && j.status !== "dismissed";
  const appliedCount = jobs.filter(isApplied).length;
  // One role listed on two boards ("HPE" and "Hewlett Packard Enterprise") shows once: the one furthest along, else the first saved.
  const seen = new Map<string, ListJob>();
  const rank = (j: ListJob) => (j.status === "new" ? 0 : j.status === "dismissed" ? -1 : 1) * 10 + (j.scores?.length ? 1 : 0);
  for (const j of [...jobs].reverse()) {
    const k = sameRoleKey(j.company, j.title);
    const had = seen.get(k);
    if (!had || rank(j) > rank(had)) seen.set(k, j);
  }
  const unique = new Set([...seen.values()].map((j) => j._id));
  const inView = jobs
    .filter((j) => unique.has(j._id))
    .filter((j) =>
      show === "hidden" ? j.status === "dismissed" : show === "old" ? isOld(j) : show === "applied" ? isApplied(j) : j.status !== "dismissed" && !isOld(j) && !isApplied(j),
    )
    // A role shows only jobs whose title matches one of its job titles, ranked by that role's score.
    .filter((j) => !track || (trackByKey.has(track) && inRole(j, trackByKey.get(track)!)));
  // Region counts follow the other filters, so each chip shows what clicking it would leave.
  const filtered = applyFilters(inView, params);
  const regionCounts = new Map<string, number>();
  for (const j of filtered) for (const r of regionsOf(j)) regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1);
  const sorted = filtered
    .filter((j) => !regionPicks.length || regionsOf(j).some((r) => regionPicks.includes(r)))
    .sort(SORTS[sort].compare(track, rates))
    // Favourites first, each group in the order picked.
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
  // Weak first guesses (no AI score, guess under the line) fold away unless a filter asks for them.
  const isWeak = (j: ListJob) => !j.favorite && fitFor(j, track) < 0 && (j.quickFit ?? 0) < WEAK_GUESS;
  // Searching by name (like "Cursor" from its company card) means you want those roles, weak or not.
  const searching = q.trim().length > 0;
  const weakCount = show || searching ? 0 : sorted.filter(isWeak).length;
  const visible = showWeak || show || searching ? sorted : sorted.filter((j) => !isWeak(j));
  // In the fit order, a heading marks where AI scores give way to first guesses, and where low AI scores start.
  const section = (j: ListJob) => (sort !== "fit" || j.favorite ? null : fitTier(fitFor(j, track)));
  const SECTION_NAMES = ["Scored below 60 by the AI", "Not scored yet: first guesses from the title and words", "Scored by the AI"];
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


  const selected = params.get("job") as Id<"jobs"> | null;
  // Open by default, like Dreamwork's filter column; the Filters button folds it away.
  const showFilters = params.get("filters") !== "0";
  const view = params.get("view") === "list" ? "list" : "grid";
  const regionLabel = (key: string) => REGIONS.find((r) => r.key === key)?.label ?? key;
  /** The region value after clicking one chip, keeping the others; the home default stays out of the URL. */
  const regionAfter = (key: string) => {
    const next = regionPicks.includes(key) ? regionPicks.filter((k) => k !== key) : [...regionPicks, key];
    if (!next.length) return homeIsBlr ? "all" : null;
    if (homeIsBlr && next.length === 1 && next[0] === "blr") return null;
    return next.join(",");
  };
  const trackName = track ? trackByKey.get(track)?.name : null;
  // What's narrowing the list, as chips you can remove one by one.
  const active: { label: string; href: string }[] = [
    ...(trackName ? [{ label: `Role: ${trackName}`, href: hrefWith({ track: null }) }] : []),
    ...(show ? [{ label: show === "hidden" ? "Not for me" : show === "applied" ? "Applied" : "Old or closed", href: hrefWith({ show: null }) }] : []),
    ...(homeIsBlr && regionParam === null ? [] : regionPicks.map((k) => ({ label: regionLabel(k), href: hrefWith({ region: regionAfter(k) }) }))),
    ...(regionPicks.length === 0 && homeIsBlr ? [{ label: "Everywhere", href: hrefWith({ region: null }) }] : []),
    ...FILTERS.flatMap((f) =>
      picks(params, f.key).map((v) => ({
        label: f.options.find((o) => o.value === v)?.label ?? v,
        href: hrefWith({ [f.key]: togglePick(params, f.key, v) }),
      })),
    ),
  ];
  const filterCount = active.length;
  const [selecting, setSelecting] = [picked.size > 0 || params.get("select") === "1", (on: boolean) => router.replace(hrefWith({ select: on ? "1" : null }), { scroll: false })];
  const open = (e: React.MouseEvent, id: string) => {
    // On a wide screen the job opens beside the list; on a phone, its full page.
    if (window.innerWidth >= 1024) {
      e.preventDefault();
      router.replace(hrefWith({ job: id }), { scroll: false });
    }
  };
  const sideChip = (href: string, label: React.ReactNode, on: boolean) => (
    <Link key={href} href={href} scroll={false} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-[1440px]">
      {!me.isOwner && !show && <ScoreTipPopup unscored={unscored.length} />}
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <span className="text-sm text-ink-3">
          {visible.length} of {inView.length}
        </span>
        <span className="flex-1" />
        <LeftToday kind="scoresLeft" label="scores" />
      </div>

      <div className="card mb-5 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field min-w-48 flex-1 !py-2"
            placeholder="Search title or company"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              router.replace(hrefWith({ q: e.target.value.trim() || null }), { scroll: false });
            }}
          />
          <select
            aria-label="Sort"
            className="field !w-auto !py-2 text-sm"
            value={sort}
            onChange={(e) => router.replace(hrefWith({ sort: e.target.value === "fit" ? null : e.target.value }), { scroll: false })}
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                Sort: {v.label}
              </option>
            ))}
          </select>
          <Link href={hrefWith({ filters: showFilters ? "0" : null })} scroll={false} className={`btn btn-sm ${showFilters ? "btn-primary" : "btn-ghost"}`}>
            Filters{filterCount ? ` · ${filterCount}` : ""}
          </Link>
          <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="View">
            {(["grid", "list"] as const).map((v) => (
              <Link key={v} href={hrefWith({ view: v === "grid" ? null : "list" })} scroll={false} className={`rounded-full px-3 py-1 text-xs ${view === v ? "bg-soft font-medium text-ink" : "text-ink-3 hover:text-ink"}`}>
                {v === "grid" ? "Cards" : "List"}
              </Link>
            ))}
          </div>
          <details className="relative">
            <summary className="btn btn-ghost btn-sm cursor-pointer list-none">+ Find or add jobs</summary>
            <div className="absolute right-0 z-20 mt-2 grid w-[min(90vw,40rem)] gap-4 rounded-xl border border-line bg-paper p-4 shadow-xl">
              <FindJobs tracks={me.tracks} />
              <AddJob />
              {me.isOwner && (
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
              )}
            </div>
          </details>
        </div>
        {(active.length > 0 || filtersOn || batch.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {active.map((a) => (
              <Link key={a.label} href={a.href} scroll={false} className="rounded-full border border-accent px-3 py-1 text-sm text-ink hover:bg-soft">
                {a.label} <span className="text-ink-3">✕</span>
              </Link>
            ))}
            {filtersOn && (
              <button className="text-sm text-ink-3 underline hover:text-ink" onClick={clearFilters}>
                Clear all
              </button>
            )}
            <span className="flex-1" />
            {batch.length > 0 && (
              <span
                title={`Reads each job against your CV and gives a real fit score in place of the "~" first guess.${unscored.length > batch.length ? ` ${unscored.length} jobs here still have only a first guess.` : ""}`}
              >
              <ActionButton
                run={async () => {
                  const { scored, failed } = await scoreJobs({ jobIds: batch });
                  return `${failed ? `Scored ${scored}, ${failed} failed. Try those again.` : `Scored ${scored}.`} ${MOVED}`;
                }}
                pending={`Reading ${batch.length} jobs against your CV…`}
                variant="ghost"
                size="sm"
              >
                {/* Plain words: reads each job against your CV and replaces the "~" first guess (was "Score 12 unscored of 272"). */}
                Get real fit scores for {batch.length} {batch.length === 1 ? "job" : "jobs"}
              </ActionButton>
              </span>
            )}
            <button className="text-sm text-ink-3 underline hover:text-ink" onClick={() => (selecting ? (setPicked(new Set()), setSelecting(false)) : setSelecting(true))}>
              {selecting ? "Done selecting" : "Select"}
            </button>
          </div>
        )}
      </div>

      <div
        className={`grid gap-5 ${
          showFilters && selected ? "lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1.15fr)]" : showFilters ? "lg:grid-cols-[15rem_minmax(0,1fr)]" : selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""
        }`}
      >
        {showFilters && (
          <aside className="card h-fit space-y-5 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Filters</span>
              <Link href={hrefWith({ filters: "0" })} scroll={false} className="text-ink-3 hover:text-ink">
                ✕
              </Link>
            </div>
            <div>
              <div className="label mb-2">Role</div>
              <div className="flex flex-wrap gap-2">
                {sideChip(hrefWith({ track: null, show: null }), "All roles", !track && !show)}
                {me.tracks.map((t) =>
                  sideChip(
                    hrefWith({ track: t.key, show: null }),
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </span>,
                    track === t.key,
                  ),
                )}
              </div>
            </div>
            {inView.length > 0 && (
              <div>
                <div className="label mb-2">Location · pick one or more</div>
                <div className="flex flex-wrap gap-2">
                  {sideChip(hrefWith({ region: homeIsBlr ? "all" : null }), `Everywhere · ${filtered.length}`, !region)}
                  {REGIONS.filter((r) => regionCounts.get(r.key) || regionPicks.includes(r.key)).map((r) =>
                    sideChip(hrefWith({ region: regionAfter(r.key) }), `${r.label} · ${regionCounts.get(r.key) ?? 0}`, regionPicks.includes(r.key)),
                  )}
                </div>
              </div>
            )}
            {FILTERS.map((f) => (
              <div key={f.key}>
                <div className="label mb-2">{f.label}</div>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o) => sideChip(hrefWith({ [f.key]: togglePick(params, f.key, o.value) }), o.label, picks(params, f.key).includes(o.value)))}
                </div>
              </div>
            ))}
            <div>
              <div className="label mb-2">Also see</div>
              <div className="flex flex-wrap gap-2">
                {sideChip(hrefWith({ track: null, show: show === "hidden" ? null : "hidden" }), "Not for me", show === "hidden")}
                {appliedCount > 0 && sideChip(hrefWith({ track: null, show: show === "applied" ? null : "applied" }), `Applied · ${appliedCount}`, show === "applied")}
                {oldCount > 0 && sideChip(hrefWith({ track: null, show: show === "old" ? null : "old" }), `Old or closed · ${oldCount}`, show === "old")}
              </div>
            </div>
          </aside>
        )}

        <div className="min-w-0">
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
                    return `${failed ? `Scored ${scored}, ${failed} failed.` : `Scored ${scored}.`} ${MOVED}`;
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
            <div className="card p-10 text-center text-ink-2">{inView.length ? "No jobs match these filters." : "No jobs here yet. Press + Find or add jobs above."}</div>
          ) : view === "grid" ? (
            <ul className={`grid gap-3 sm:grid-cols-2 ${selected ? "2xl:grid-cols-3" : showFilters ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
              {visible.slice(0, shown).map((j) => {
                const best = track ? j.scores?.find((s) => s.trackKey === track) : bestScore(j);
                // Only pay the posting lists; a board's own guess counts as not listed (see payText).
                const listed = payText(j.salary, rates);
                const isNew = now - j._creationTime < 2 * 86_400_000 && j.status === "new";
                return (
                  <li key={j._id} className={`card flex flex-col p-4 transition ${selected === j._id ? "!border-accent ring-1 ring-accent" : "hover:border-ink-3"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CompanyMark job={j} size={36} />
                        {isNew && <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-semibold text-violet">NEW</span>}
                        {j.status !== "new" && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-on-accent">{STATUS_LABELS[j.status]}</span>}
                      </div>
                      <FitBadge job={best ? { scores: [best] } : j} size={40} />
                    </div>
                    <div className="mt-3 flex justify-between gap-2 text-xs text-ink-3">
                      <span className="truncate">{j.company}</span>
                      <span className="max-w-[50%] truncate">{j.location}</span>
                    </div>
                    <Link href={`/jobs/${j._id}`} onClick={(e) => open(e, j._id)} scroll={false} className="mt-0.5 line-clamp-2 font-medium leading-snug hover:underline">
                      {j.title}
                    </Link>
                    {listed && <div className="mt-3 text-lg font-semibold">{listed}</div>}
                    {j.postedAt && <div className={`${listed ? "" : "mt-3 "}text-[11px] text-ink-3`}>Posted {timeAgo(j.postedAt)}</div>}
                    {(j.liveCheck?.state === "closed" || j.brief?.blocker) && (
                      <div className="mt-1 text-[11px] text-bad">{j.liveCheck?.state === "closed" ? "Looks closed" : "Rules you out"}</div>
                    )}
                    <div className="mt-auto flex items-center gap-2 pt-4">
                      <button
                        type="button"
                        aria-label={`Not for me: ${j.title}`}
                        title="Not for me"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-3 hover:text-bad"
                        onClick={() => void setStatusMany({ jobIds: [j._id], status: "dismissed" }).catch(() => {})}
                      >
                        ✕
                      </button>
                      <FavoriteStar jobId={j._id} favorite={!!j.favorite} className="shrink-0" />
                      <Link href={`/jobs/${j._id}`} onClick={(e) => open(e, j._id)} scroll={false} className="btn btn-primary btn-sm flex-1 justify-center">
                        {best ? "Open" : "Check the fit"}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-2">
              {visible.slice(0, shown).map((j, i, rows) => {
                const best = track ? j.scores?.find((s) => s.trackKey === track) : bestScore(j);
                const here = section(j);
                const heading = here !== null && (i === 0 || section(rows[i - 1]) !== here) ? SECTION_NAMES[here] : null;
                const pay = payText(j.salary, rates);
                const on = selected === j._id;
                return (
                  <Fragment key={j._id}>
                    {heading && <li className="label px-1 pt-3 pb-1">{heading}</li>}
                    <li className={`card flex items-center gap-2 pr-3 transition ${on ? "!border-accent ring-1 ring-accent" : "hover:border-ink-3"} ${picked.has(j._id) ? "bg-soft" : ""}`}>
                      {selecting && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${j.title}`}
                          className="ml-3 h-4 w-4 shrink-0"
                          checked={picked.has(j._id)}
                          onChange={(e) => {
                            const next = new Set(picked);
                            if (e.target.checked) next.add(j._id);
                            else next.delete(j._id);
                            setPicked(next);
                          }}
                        />
                      )}
                      <Link href={`/jobs/${j._id}`} onClick={(e) => open(e, j._id)} scroll={false} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3">
                        <CompanyMark job={j} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{j.title}</span>
                            {j.status !== "new" && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">{STATUS_LABELS[j.status]}</span>}
                          </div>
                          <div className="truncate text-sm text-ink-2">
                            {j.company}
                            {pay ? ` · ${pay}` : ""}
                            {j.location ? ` · ${j.location}` : ""}
                            {j.postedAt ? ` · ${timeAgo(j.postedAt)}` : ""}
                          </div>
                          {(strongCompany(j.company) || j.liveCheck?.state === "closed" || j.brief?.blocker) && (
                            <div className="mt-0.5 flex gap-2 text-[11px]">
                              {strongCompany(j.company) && <span className="text-ink-3">Top company</span>}
                              {j.liveCheck?.state === "closed" && <span className="text-bad">Looks closed</span>}
                              {j.brief?.blocker && <span className="text-bad">Rules you out</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <FitBadge job={best ? { scores: [best] } : j} size={36} />
                          {!selected && <TrackTag track={trackByKey.get((track ?? jobTrackKey(j, me.tracks)) ?? "")} />}
                        </div>
                      </Link>
                      <FavoriteStar jobId={j._id} favorite={!!j.favorite} className="shrink-0" />
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
          {(visible.length > shown || weakCount > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {visible.length > shown && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShown(shown + PAGE * 2)}>
                  Show more ({visible.length - shown} left)
                </button>
              )}
              {weakCount > 0 && (
                <button className="text-ink-3 underline hover:text-ink" onClick={() => setShowWeak(!showWeak)}>
                  {showWeak ? "Hide weak matches" : `Show ${weakCount} weak ${weakCount === 1 ? "match" : "matches"} (first guess under ${WEAK_GUESS})`}
                </button>
              )}
            </div>
          )}
        </div>

        {selected && (
          <div className="hidden lg:block">
            <div className="sticky top-4">
              <JobPanel key={selected} jobId={selected} onClose={() => router.replace(hrefWith({ job: null }), { scroll: false })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
