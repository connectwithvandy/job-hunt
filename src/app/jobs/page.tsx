"use client";

import { rankFit, stalePenalty } from "../../../convex/lib/posting";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STATUS_LABELS } from "../../../convex/lib/defaults";
import { CompanyMark, PageHead, QuickFitPill, ScorePill, TrackTag, bestScore, jobTrackKey, timeAgo } from "@/components/bits";
import { AddJob, FavoriteStar, FindJobs } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton, LeftToday, useLeftToday } from "@/components/ui";
import { applyFilters, FILTERS, fitFor, fitTier, inRole } from "@/lib/jobFilters";
import { payPerYearInr, payText, useInrRates } from "@/lib/money";
import { REGIONS, regionsOf } from "@/lib/regions";
import { sameRoleKey } from "../../../convex/lib/company";
import { ScoreTipPopup } from "@/components/ScoreTipPopup";

type ListJob = FunctionReturnType<typeof api.jobs.list>[number];
// First guesses this low are almost never worth opening; they fold away under the list.
const WEAK_GUESS = 40;
// Scored jobs leave the "not scored" list; without this they seemed to vanish (14 Nov, new-user walk).
const MOVED = "Good fits (60+) move to the top; lower ones go to the bottom, under \"Scored below 60\".";
// Rows drawn at first; the rest wait behind "Show more" so a long list opens quickly.
const PAGE = 60;
const byTime = (j: ListJob) => (j.postedAt ? Date.parse(j.postedAt) : j._creationTime);

/** Ways to order the list. Jobs without the thing being sorted on go last. */
/** The AI score when there is one, else the quick fit. */
const fitOrQuick = (j: ListJob, role: string | null) => {
  // Old or closed postings sink below fresh ones with the same fit (see stalePenalty).
  const fit = rankFit(fitFor(j, role), j);
  return fit >= 0 ? fit : (j.quickFit ?? -1) - stalePenalty(j);
};

const SORTS = {
  // AI-scored jobs at the line or above come first, then first guesses, which run high.
  fit: {
    label: "Best fit",
    compare: (role: string | null) => (a: ListJob, b: ListJob) =>
      fitTier(rankFit(fitFor(b, role), b)) - fitTier(rankFit(fitFor(a, role), a)) || fitOrQuick(b, role) - fitOrQuick(a, role) || b._creationTime - a._creationTime,
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
  const [shown, setShown] = useState(PAGE);
  const [showWeak, setShowWeak] = useState(false);
  if (!me || !jobs) return <Loading />;
  const trackByKey = new Map(me.tracks.map((t) => [t.key, t]));
  const homeIsBlr = /bengaluru|bangalore/i.test(me.location);
  const sort = (params.get("sort") ?? "fit") as keyof typeof SORTS;
  const region = regionParam === "all" ? null : (regionParam ?? (homeIsBlr ? "blr" : null));

  // New jobs posted (or found) over 45 days ago are likely filled; they move to their own chip.
  // A role from a company's own careers board was live when found, so its age counts from then.
  // Closed postings join them (the morning re-check marks them): nobody should apply to those by mistake.
  const isOld = (j: (typeof jobs)[number]) =>
    j.status === "new" && (j.liveCheck?.state === "closed" || now - (j.postedAt && j.source !== "careers" ? Date.parse(j.postedAt) : j._creationTime) > 45 * 86_400_000);
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
    .filter((j) => !region || regionsOf(j).includes(region as never))
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
  const chip = (href: string, label: React.ReactNode, active: boolean) => (
    <Link key={href} href={href} className={`rounded-full border px-3 py-1 text-sm ${active ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead title="Jobs" sub="Every role you're considering, sorted by how well it fits your best role." />
      {!me.isOwner && !show && <ScoreTipPopup unscored={unscored.length} />}

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
        {oldCount > 0 && chip(hrefWith({ track: null, show: "old" }), `Old or closed · ${oldCount}`, show === "old")}
        <span className="flex-1" />
        {batch.length > 0 && (
          <ActionButton
            run={async () => {
              const { scored, failed } = await scoreJobs({ jobIds: batch });
              return `${failed ? `Scored ${scored}, ${failed} failed. Try those again.` : `Scored ${scored}.`} ${MOVED}`;
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
        <div className="card p-10 text-center text-ink-2">{inView.length ? "No jobs match these filters." : "No jobs here yet. Search above, or paste a job description you saw."}</div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {visible.slice(0, shown).map((j, i, rows) => {
            const best = track ? j.scores?.find((s) => s.trackKey === track) : bestScore(j);
            const here = section(j);
            const heading = here !== null && (i === 0 || section(rows[i - 1]) !== here) ? SECTION_NAMES[here] : null;
            return (
              <Fragment key={j._id}>
              {heading && <li className="label bg-soft px-4 py-2">{heading}</li>}
              <li className={`flex items-start ${picked.has(j._id) ? "bg-soft" : ""}`}>
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
                      {payText(j.salary, rates) ? ` · ${payText(j.salary, rates)}` : ""}
                      {j.liveCheck?.state === "closed" && <span className="text-bad"> · Looks closed</span>}
                      {j.brief?.blocker && <span className="text-bad"> · Rules you out</span>}
                    </div>
                    {best && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{best.reason}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {best ? <ScorePill score={best.score} /> : <QuickFitPill score={j.quickFit} />}
                    <TrackTag track={trackByKey.get((track ?? jobTrackKey(j, me.tracks)) ?? "")} />
                  </div>
                </Link>
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
  );
}
