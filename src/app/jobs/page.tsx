"use client";

import { stalePenalty } from "../../../convex/lib/posting";
import { ARCHIVE_DAYS_DEFAULT, archiveLabel, isArchived } from "@/lib/archive";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CompanyMark, FitBadge, bestScore, jobTrackKey } from "@/components/bits";
import { strongCompany } from "../../../convex/lib/quickFit";
import { JobRow, metaOf, postedAgo, StateButton, workMode } from "@/components/JobState";
import { employerLine, showCompany, showPlace, showTitle } from "@/lib/tidy";
import { AddJob, FavoriteStar, FindJobs } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton, LeftToday, useLeftToday } from "@/components/ui";
import { applyFilters, FILTERS, fitFor, fitTier, inRole, offTarget, picks, togglePick } from "@/lib/jobFilters";
import { payPerYearInr, payText, useInrRates } from "@/lib/money";
import { REGIONS, regionsOf } from "@/lib/regions";
import { junkCompany, sameRoleKey, storeRetailJob } from "../../../convex/lib/company";
import { ScoreTipPopup } from "@/components/ScoreTipPopup";
import { JobPanel } from "@/components/JobPanel";
import { isNewJob } from "@/lib/fresh";
import { SCORE_BATCH, STAGE_WORDS } from "@/lib/stages";

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
  // Only what the last day's searches found (Today's "4 new since yesterday" opens this).
  const newOnly = params.get("new") === "1";
  // With a home city set, the list opens on that city plus remote; "all" shows everywhere.
  const regionParam = params.get("region");
  const me = useQuery(api.users.me);
  const findHiringPosts = useAction(api.agent.findHiringPosts);
  const saved = useQuery(api.jobs.list);
  const prefs = useQuery(api.users.jobPrefs);
  const scoreJobs = useAction(api.agent.scoreJobs);
  const scoresLeft = useLeftToday("scoresLeft");
  const setStatusMany = useMutation(api.jobs.setStatusMany);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [showWeak, setShowWeak] = useState(false);
  if (!me || !saved) return <Loading />;
  // Listings with a broken company name ("due to several reasons.", "LLP") look scraped: not shown until acted on.
  // Shop-floor retail jobs (owner, 27 Nov) are never shown either.
  const jobs = saved.filter((j) => j.status !== "new" || (!junkCompany(j.company) && !storeRetailJob(j)));
  const trackByKey = new Map(me.tracks.map((t) => [t.key, t]));
  const homeIsBlr = /bengaluru|bangalore/i.test(me.location);
  const sort = (params.get("sort") ?? "fit") as keyof typeof SORTS;
  // Several regions can be on together, like Bengaluru and Remote; "all" means everywhere.
  const regionPicks = regionParam === "all" ? [] : regionParam ? regionParam.split(",").filter(Boolean) : homeIsBlr ? ["blr"] : [];
  const region = regionPicks.length ? regionPicks.join(",") : null;

  // New jobs posted (or found) over 45 days ago are likely filled; they move to their own chip.
  // Closed postings join them (the morning re-check marks them): nobody should apply to those by mistake.
  // Careers-board roles used to count from when we found them (still live on the company's own board), with a 6-month
  // evergreen cut-off (16 Nov walk: Flyy 32 months, Datadog 10 months near the top). That let a card say "Posted 3mo ago"
  // in the main list (19 Nov), so every source now counts from the posting date the card shows.
  // Archived: closed, or a posting older than the limit in Job preferences (lib/archive.ts, shared with Today).
  const maxAgeDays = prefs?.maxAgeDays ?? ARCHIVE_DAYS_DEFAULT;
  const isOld = (j: (typeof jobs)[number]) => isArchived(j, now, maxAgeDays);
  const oldCount = jobs.filter(isOld).length;
  // Applied and later live on the Tracker, so this list stays jobs you can still apply to.
  const isApplied = (j: (typeof jobs)[number]) => j.status !== "new" && j.status !== "applying" && j.status !== "dismissed";
  const appliedCount = jobs.filter(isApplied).length;
  // One role listed on two boards ("HPE" and "Hewlett Packard Enterprise") shows once: the one furthest along, else the first saved.
  const seen = new Map<string, ListJob>();
  // One role posted per city counts once too: the copy in your picked places wins, so it isn't filtered away.
  const rank = (j: ListJob) =>
    (j.status === "new" ? 0 : j.status === "dismissed" ? -1 : 1) * 10 + (j.scores?.length ? 1 : 0) + (regionPicks.length && regionsOf(j).some((r) => regionPicks.includes(r)) ? 5 : 0);
  for (const j of [...jobs].reverse()) {
    const k = sameRoleKey(j.company, j.title);
    const had = seen.get(k);
    if (!had || rank(j) > rank(had)) seen.set(k, j);
  }
  const unique = new Set([...seen.values()].map((j) => j._id));
  // Every open job, before filters: the same number as Today's Prospect + Qualified + Proposal.
  const allOpen = jobs.filter((j) => unique.has(j._id) && j.status !== "dismissed" && !isOld(j) && !isApplied(j)).length;
  const inView = jobs
    .filter((j) => unique.has(j._id))
    .filter((j) =>
      show === "hidden" ? j.status === "dismissed" : show === "old" ? isOld(j) : show === "applied" ? isApplied(j) : j.status !== "dismissed" && !isOld(j) && !isApplied(j),
    )
    // A role shows only jobs whose title matches one of its job titles, ranked by that role's score.
    .filter((j) => !track || (trackByKey.has(track) && inRole(j, trackByKey.get(track)!)))
    .filter((j) => !newOnly || isNewJob(j, now));
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
  // Off-target titles (assistants, shop-floor and hotel sales) join the looser matches too, scored or not.
  const isWeak = (j: ListJob) => !j.favorite && ((fitFor(j, track) < 0 && (j.quickFit ?? 0) < WEAK_GUESS) || offTarget(j.title, j.company));
  // Searching by name (like "Cursor" from its company card) means you want those roles, weak or not.
  const searching = q.trim().length > 0;
  const weakCount = show || searching || newOnly ? 0 : sorted.filter(isWeak).length;
  const kept = showWeak || show || searching || newOnly ? sorted : sorted.filter((j) => !isWeak(j));
  // What the last day's searches found leads the list, in its own group, best fit first (27 Nov review: freshness).
  const newGroup = sort === "fit" && !show && !newOnly;
  // Today's "N new to you" counts every new job; when filters or looser matches hide some here, the heading says so.
  const allNew = jobs.filter((j) => unique.has(j._id) && isNewJob(j, now) && !isOld(j)).length;
  const newHeading = (shownNew: number) =>
    allNew > shownNew ? `New to you since yesterday · ${allNew} found, ${allNew - shownNew} hidden by your filters or as looser matches` : "New to you since yesterday";
  const visible = newGroup ? [...kept.filter((j) => isNewJob(j, now)), ...kept.filter((j) => !isNewJob(j, now))] : kept;
  // In the fit order, a heading marks where AI scores give way to first guesses, and where low AI scores start.
  const section = (j: ListJob) => (newGroup && isNewJob(j, now) ? 3 : sort !== "fit" || j.favorite ? null : fitTier(fitFor(j, track)));
  const SECTION_NAMES = ["Scored, weaker fit", "Not scored yet", "Scored for you", "New to you since yesterday"];
  const [showWeaker, setShowWeaker] = [params.get("weaker") === "1", (on: boolean) => router.replace(hrefWith({ weaker: on ? "1" : null }), { scroll: false })];
  const unscored = visible.filter((j) => !j.scores?.length).map((j) => j._id);
  // Never ask for more scores than today's allowance has left; the owner has no limit.
  // The same batch as Today's "Score my top 5" (27 Nov review: 5 there, 12 here, and neither said what it used).
  const batch = unscored.slice(0, me.isOwner ? SCORE_BATCH : Math.min(SCORE_BATCH, scoresLeft ?? SCORE_BATCH));

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
  const filtersOn = params.has("q") || newOnly || FILTERS.some((f) => params.has(f.key));
  const clearFilters = () => {
    setQ("");
    router.replace(hrefWith({ q: null, new: null, ...Object.fromEntries(FILTERS.map((f) => [f.key, null])) }), { scroll: false });
  };


  const selected = params.get("job") as Id<"jobs"> | null;
  // Open by default on a computer; the Filters button folds it away.
  const showFilters = params.get("filters") !== "0";
  // On a phone the column sits above the jobs and filled the first screen (23 Nov walk), so there it opens only when asked.
  const phoneFilters = params.get("filters") === "1";
  // Cards on a computer by default (owner, 27 Nov: "this is better"), a list on a phone; either can be picked.
  const view: "grid" | "list" | "auto" = params.get("view") === "list" ? "list" : params.get("view") === "cards" ? "grid" : "auto";
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
    ...(newOnly ? [{ label: "New to you since yesterday", href: hrefWith({ new: null }) }] : []),
    ...(trackName ? [{ label: `Role: ${trackName}`, href: hrefWith({ track: null }) }] : []),
    ...(show ? [{ label: show === "hidden" ? "Not for me" : show === "applied" ? "Applied" : "Archived", href: hrefWith({ show: null }) }] : []),
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
    <Link
      key={href}
      href={href}
      scroll={false}
      aria-pressed={on}
      className={`inline-flex min-h-8 items-center rounded-full border px-3 text-[13px] [@media(pointer:coarse)]:min-h-11 ${on ? "border-ink bg-ink font-semibold text-paper" : "border-line-strong bg-card text-ink-2 [@media(hover:hover)]:hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  const scoreTop = batch.length > 0 && (
    <span title={`Reads each job against your CV and gives a real fit score in place of the rough guess.${scoresLeft !== undefined && !me.isOwner ? ` ${scoresLeft} scores left today.` : ""}`}>
      <ActionButton
        run={async () => {
          const { scored, failed } = await scoreJobs({ jobIds: batch });
          return `${failed ? `Scored ${scored}, ${failed} failed. Try those again.` : `Scored ${scored}.`} ${MOVED}`;
        }}
        pending={`Scoring ${batch.length}…`}
        variant="ghost"
        size="sm"
      >
        Score top {batch.length}
        {!me.isOwner && scoresLeft !== undefined && <span className="font-normal text-ink-3"> · uses {batch.length} of {scoresLeft}</span>}
      </ActionButton>
    </span>
  );
  const filterGroups = (
    <>
      {(
      <div>
        <h3 className="label mb-2">Role</h3>
        <div className="flex flex-wrap gap-2">
          {sideChip(hrefWith({ track: null, show: null }), <span>All roles <span className="tnum opacity-70">{allOpen}</span></span>, !track && !show)}
          {me.tracks.map((t) =>
            sideChip(
              hrefWith({ track: t.key, show: null }),
              <span>
                {t.name} <span className="tnum opacity-70">{jobs.filter((j) => unique.has(j._id) && j.status !== "dismissed" && !isOld(j) && !isApplied(j) && inRole(j, t)).length}</span>
              </span>,
              track === t.key,
            ),
          )}
        </div>
      </div>
      )}
      {inView.length > 0 && (
        <div>
          <h3 className="label mb-2">Location</h3>
          <div className="flex flex-wrap gap-2">
            {sideChip(hrefWith({ region: homeIsBlr ? "all" : null }), <span>Everywhere <span className="tnum text-ink-3">{filtered.length}</span></span>, !region)}
            {REGIONS.filter((r) => regionCounts.get(r.key) || regionPicks.includes(r.key)).map((r) =>
              sideChip(hrefWith({ region: regionAfter(r.key) }), <span>{r.label} <span className="tnum opacity-70">{regionCounts.get(r.key) ?? 0}</span></span>, regionPicks.includes(r.key)),
            )}
          </div>
        </div>
      )}
      {/* Fit only once something is scored: until then it's one chip that changes nothing. */}
      {FILTERS.filter((f) => f.key === "fit").map((f) => (
        <div key={f.key}>
          <h3 className="label mb-2">{f.label}</h3>
          <div className="flex flex-wrap gap-2">
            {f.options.map((o) =>
              sideChip(
                hrefWith({ [f.key]: togglePick(params, f.key, o.value) }),
                <span>
                  {o.label} <span className="tnum opacity-70">{inView.filter((j) => o.test(j, track)).length}</span>
                </span>,
                picks(params, f.key).includes(o.value),
              ),
            )}
          </div>
        </div>
      ))}
      {/* Every filter group open, as before (owner, 27 Nov). */}
      <div className="space-y-6">
          {FILTERS.filter((f) => f.key !== "fit").map((f) => (
            <div key={f.key}>
              <h3 className="label mb-2">{f.label}</h3>
              <div className="flex flex-wrap gap-2">{f.options.map((o) => sideChip(hrefWith({ [f.key]: togglePick(params, f.key, o.value) }), o.label, picks(params, f.key).includes(o.value)))}</div>
            </div>
          ))}
          <div>
            <h3 className="label mb-2">Also see</h3>
            <div className="flex flex-wrap gap-2">
              {sideChip(hrefWith({ track: null, show: show === "hidden" ? null : "hidden" }), "Not for me", show === "hidden")}
              {appliedCount > 0 && sideChip(hrefWith({ track: null, show: show === "applied" ? null : "applied" }), `Sent or later ${appliedCount}`, show === "applied")}
              {oldCount > 0 && sideChip(hrefWith({ track: null, show: show === "old" ? null : "old" }), `Archived ${oldCount}`, show === "old")}
            </div>
          </div>
      </div>
    </>
  );
  const notForMe = (j: ListJob) => (
    <button
      type="button"
      aria-label={`Not for me: ${j.company}`}
      title="Not for me"
      className="btn-icon"
      onClick={(e) => {
        e.preventDefault();
        void setStatusMany({ jobIds: [j._id], status: "dismissed" }).catch(() => {});
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
  /** Status tags (Looks closed, New, Top company) on their own short line, so the details line keeps its room. */
  const tagLine = (j: ListJob) => {
    const t = tags(j);
    const any = j.liveCheck?.state === "closed" || j.brief?.blocker || j.status === "applying" || isNewJob(j, now) || strongCompany(j.company);
    // With one role, its name goes in the group heading once instead of on every row (27 Nov review).
    const role = me.tracks.length > 1 ? trackByKey.get((track ?? jobTrackKey(j, me.tracks)) ?? "")?.name : undefined;
    return any || role ? (
      <>
        {t}
        {strongCompany(j.company) && <span className="mono mr-2 before:mr-2 before:content-['·'] first:before:content-none">Top company</span>}
        {role && <span className="mono before:mr-2 before:content-['·'] first:before:content-none">{role}</span>}
      </>
    ) : null;
  };
  const tags = (j: ListJob) => (
    <>
      {(j.liveCheck?.state === "closed" || j.brief?.blocker || j.status === "applying") && (
        <span className={`mono mr-2 ${j.liveCheck?.state === "closed" || j.brief?.blocker ? "!text-bad" : ""}`}>{j.liveCheck?.state === "closed" ? "Looks closed" : j.brief?.blocker ? "Rules you out" : `${STAGE_WORDS[j.status] ?? j.status}: CV ready`}</span>
      )}
      {isNewJob(j, now) && !isOld(j) && <span className="mono mr-2 !text-ink">New to you</span>}
    </>
  );

  return (
    <div className="mx-auto max-w-[1440px]">
      {!me.isOwner && !show && <ScoreTipPopup unscored={unscored.length} />}
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-3">
        <h1 className="h1">Jobs</h1>
        {/* One count that matches Today; what filters hide is said, never silently dropped (27 Nov review: 88 vs 92). */}
        <span className="tnum text-[15px] text-ink-3">
          {show ? `${visible.length} shown` : `${allOpen} open`}
          {!show && allOpen > visible.length && (
            <>
              {" · "}
              {visible.length} shown, {allOpen - visible.length} hidden
              {/* Say what hides them, so the chips and this line add up (27 Nov review). */}
              {` (${[weakCount ? `${weakCount} looser ${weakCount === 1 ? "match" : "matches"}` : null, allOpen - visible.length - weakCount > 0 ? `${allOpen - visible.length - weakCount} by your filters` : null].filter(Boolean).join(", ")})`}{" "}
              <button
                type="button"
                className="btn-text inline-flex !text-[15px] underline"
                onClick={() => {
                  setQ("");
                  setShowWeak(true);
                  router.replace(hrefWith({ q: null, new: null, track: null, region: "all", ...Object.fromEntries(FILTERS.map((f) => [f.key, null])) }), { scroll: false });
                }}
              >
                Show all
              </button>
            </>
          )}
        </span>
        <span className="tnum text-[13px] [&>span]:!text-[13px] max-[359px]:order-last max-[359px]:basis-full">
          <LeftToday kind="scoresLeft" label="scores" />
        </span>
        <span className="flex-1" />
        <details className="relative">
          <summary className="btn btn-secondary btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden" aria-label="Find or add a job">
            <span className="sm:hidden">+ Add job</span>
            <span className="hidden sm:inline">Find or add a job</span>
          </summary>
          <div className="card pop absolute right-0 z-30 mt-2 grid w-[min(calc(100vw-2rem),40rem)] gap-4 p-4">
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

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          type="search"
          className="field lg:flex-1"
          placeholder="Search title or company"
          aria-label="Search title or company"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            router.replace(hrefWith({ q: e.target.value.trim() || null }), { scroll: false });
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sort"
            className="field !w-auto shrink-0 max-lg:!rounded-full max-lg:!border-line-strong max-lg:!bg-card max-lg:font-semibold"
            value={sort}
            onChange={(e) => router.replace(hrefWith({ sort: e.target.value === "fit" ? null : e.target.value }), { scroll: false })}
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <Link href={hrefWith({ filters: showFilters ? "0" : null })} scroll={false} className="btn btn-secondary btn-sm shrink-0 !hidden lg:!inline-flex" aria-expanded={showFilters}>
            {showFilters ? "Hide filters" : "Filters"}{filterCount ? ` · ${filterCount}` : ""}
          </Link>
          <Link href={hrefWith({ filters: phoneFilters ? null : "1" })} scroll={false} className="btn btn-secondary btn-sm shrink-0 lg:!hidden">
            Filters{filterCount ? ` · ${filterCount}` : ""}
          </Link>
          <div className="hidden shrink-0 rounded-full bg-soft p-1 lg:flex" role="group" aria-label="View">
            {(["grid", "list"] as const).map((v) => (
              <Link
                key={v}
                href={hrefWith({ view: v === "grid" ? null : "list" })}
                scroll={false}
                aria-pressed={view === v || (view === "auto" && v === "grid")}
                className={`rounded-full px-3 py-1 text-[13px] font-semibold ${view === v || (view === "auto" && v === "grid") ? "bg-card text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
              >
                {v === "grid" ? "Cards" : "List"}
              </Link>
            ))}
          </div>
          <span className="shrink-0">{scoreTop}</span>
          <button type="button" className="btn-text shrink-0 max-lg:hidden" aria-pressed={selecting} onClick={() => (selecting ? (setPicked(new Set()), setSelecting(false)) : setSelecting(true))}>
            {selecting ? "Done selecting" : "Select"}
          </button>
        </div>
      </div>
      {(active.length > 0 || filtersOn) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {active.map((a) => (
            <Link key={a.label} href={a.href} scroll={false} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-ink px-3 text-[13px] font-semibold text-paper">
              {a.label} <span aria-hidden>✕</span>
              <span className="sr-only">remove</span>
            </Link>
          ))}
          {filtersOn && (
            <button className="btn-text" onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>
      )}

      {phoneFilters && (
        <div className="fixed inset-0 z-50 flex flex-col bg-paper lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <h2 className="h2">Filters</h2>
            <Link href={hrefWith({ filters: null })} scroll={false} className="btn-text">
              Done
            </Link>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-[calc(24px+env(safe-area-inset-bottom))]">{filterGroups}</div>
        </div>
      )}

      <div
        className={`grid gap-8 ${
          showFilters && selected ? "lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.15fr)]" : showFilters ? "lg:grid-cols-[220px_minmax(0,1fr)]" : selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""
        }`}
      >
        {showFilters && <aside className="hidden h-fit space-y-6 lg:block">{filterGroups}</aside>}

        <div className="min-w-0">
          {picked.size > 0 && (
            <div className="card pop sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-2 p-3 text-[15px]">
              <span className="tnum font-semibold">{picked.size} selected</span>
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
              <button type="button" className="btn-text" onClick={() => setPicked(new Set(visible.map((j) => j._id)))}>
                Select all {visible.length}
              </button>
              <button type="button" className="btn-text" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </div>
          )}
          {show === "old" && (
            <p className="mb-3 text-sm text-ink-2">
              Postings older than {archiveLabel(maxAgeDays)}, or closed. Change this in{" "}
              <Link href="/preferences" className="underline hover:text-ink">
                Job preferences
              </Link>
              .
            </p>
          )}
          {visible.length === 0 ? (
            <div className="card p-8">
              <h2 className="h2">{inView.length ? "No jobs match these filters" : "No jobs here yet"}</h2>
              <p className="mt-1 text-[15px] text-ink-2">{inView.length ? "Remove a filter to see more." : "Find or add a job to start your list."}</p>
            </div>
          ) : null}
          {visible.length > 0 && view !== "list" && (() => {
            const card = (j: ListJob) => {
                const best = track ? j.scores?.find((s) => s.trackKey === track) : bestScore(j);
                const listed = payText(j.salary, rates);
                return (
                  <li key={j._id} className={`card flex min-w-0 flex-col p-4 ${selected === j._id ? "outline-2 outline-ink" : ""}`}>
                    {/* Everything at a glance, like the earlier card the owner preferred: logo and fit ring, company and
                        place, title, pay when listed, age, then save, not-for-me and the job's button, all always visible. */}
                    <div className="flex items-start justify-between gap-2">
                      <CompanyMark job={j} size={40} />
                      <FitBadge job={best ? { scores: [best] } : j} size={40} />
                    </div>
                    <div className="row-meta mt-3 flex justify-between gap-2">
                      <span className="truncate">{employerLine(j)}</span>
                      {/* Same place and work setting as the phone row (28 Nov review: "Mumbai" here, "Mumbai · Remote" there). */}
                      <span className="max-w-[55%] truncate">{[showPlace(j), workMode(j.workSetting)].filter(Boolean).join(" · ")}</span>
                    </div>
                    <Link href={`/jobs/${j._id}`} onClick={(e) => open(e, j._id)} scroll={false} className="row-title mt-0.5 line-clamp-2 hover:underline">
                      {showTitle(j.title)}
                    </Link>
                    {listed && <div className="tnum mt-2 font-[family-name:var(--font-display-face)] text-lg font-semibold">{listed}</div>}
                    <div className="row-meta mt-1 line-clamp-2">
                      {tags(j)}
                      {strongCompany(j.company) && <span className="mono mr-2">Top company</span>}
                      {j.postedAt ? `Posted ${postedAgo(j.postedAt)}` : ""}
                    </div>
                    <div className="mt-auto flex items-center gap-1 pt-4">
                      {notForMe(j)}
                      <FavoriteStar jobId={j._id} favorite={!!j.favorite} className="shrink-0" />
                      <span className="min-w-0 flex-1 [&>.btn]:w-full [&>a]:w-full [&>button]:w-full">
                        <StateButton j={j} />
                      </span>
                    </div>
                  </li>
                );
            };
            const rows = visible.slice(0, shown);
            const fresh = newGroup ? rows.filter((j) => isNewJob(j, now)) : [];
            const rest = rows.slice(fresh.length);
            // The rest under the same headings as the list view ("Scored for you", "Not scored yet"…), so a computer and a
            // phone name the same groups the same way (27 Nov review).
            const groupsOf = (items: ListJob[]) => {
              const out: { heading: string | null; items: ListJob[] }[] = [];
              items.forEach((j, i) => {
                const here = section(j);
                if (i === 0 || here !== section(items[i - 1])) out.push({ heading: here === null ? null : SECTION_NAMES[here], items: [] });
                out.at(-1)!.items.push(j);
              });
              return out;
            };
            const grid = (items: ListJob[]) => <ul className={`grid gap-4 sm:grid-cols-2 ${selected ? "2xl:grid-cols-3" : showFilters ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4"}`}>{items.map(card)}</ul>;
            return (
              <div className={view === "auto" ? "max-lg:hidden" : ""}>
                {fresh.length > 0 ? (
                  <>
                    <h2 className="mb-2 text-[13px] font-semibold text-ink-2">{newHeading(visible.filter((j) => isNewJob(j, now)).length)}</h2>
                    <div className="mb-8">{grid(fresh)}</div>
                    {groupsOf(rest).map((g, gi) => (
                      <section key={gi} className="mb-8">
                        {g.heading && <h2 className="mb-2 text-[13px] font-semibold text-ink-2">{g.heading}</h2>}
                        {grid(g.items)}
                      </section>
                    ))}
                  </>
                ) : (
                  groupsOf(rows).map((g, gi) => (
                    <section key={gi} className="mb-8">
                      {g.heading && <h2 className="mb-2 text-[13px] font-semibold text-ink-2">{g.heading}</h2>}
                      {grid(g.items)}
                    </section>
                  ))
                )}
              </div>
            );
          })()}
          {visible.length > 0 && view !== "grid" && (
            <div className={view === "auto" ? "lg:hidden" : ""}>
              {(() => {
                const rows = visible.slice(0, shown);
                const groups: { heading: string | null; items: ListJob[] }[] = [];
                rows.forEach((j, i) => {
                  const here = section(j);
                  if (i === 0 || here !== section(rows[i - 1])) groups.push({ heading: here === null ? null : here === 3 ? newHeading(visible.filter((j) => isNewJob(j, now)).length) : SECTION_NAMES[here], items: [] });
                  groups.at(-1)!.items.push(j);
                });
                return groups.map((g, gi) =>
                  g.heading === SECTION_NAMES[0] && !showWeaker ? (
                    <button key={gi} type="button" className="btn-text mb-6 -ml-1" onClick={() => setShowWeaker(true)}>
                      Show {g.items.length} weaker {g.items.length === 1 ? "fit" : "fits"}
                    </button>
                  ) : (
                  <section key={gi} className="mb-6">
                    {g.heading && (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h2 className="text-[13px] font-semibold text-ink-2">
                          {g.heading}
                          {me.tracks.length === 1 && <span className="font-normal text-ink-3"> · {me.tracks[0].name}</span>}
                        </h2>
                        {gi === 0 && (
                          <button type="button" className="btn-text lg:hidden" aria-pressed={selecting} onClick={() => (selecting ? (setPicked(new Set()), setSelecting(false)) : setSelecting(true))}>
                            {selecting ? "Done selecting" : "Select"}
                          </button>
                        )}
                      </div>
                    )}
                    <ul className="card overflow-hidden">
                      {g.items.map((j) => {
                        const best = track ? j.scores?.find((s) => s.trackKey === track) : bestScore(j);
                        const pay = payText(j.salary, rates);
                        const on = selected === j._id;
                        return (
                            <JobRow
                              key={j._id}
                              selected={on || picked.has(j._id)}
                              check={
                                selecting ? (
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${j.title}`}
                                    className="h-5 w-5 accent-[var(--ink)]"
                                    checked={picked.has(j._id)}
                                    onChange={(e) => {
                                      const next = new Set(picked);
                                      if (e.target.checked) next.add(j._id);
                                      else next.delete(j._id);
                                      setPicked(next);
                                    }}
                                  />
                                ) : undefined
                              }
                              j={j}
                              href={`/jobs/${j._id}`}
                              onOpen={(e) => open(e, j._id)}
                              tagLine={tagLine(j)}
                              meta={
                                <>
                                  {metaOf(j, pay)}

                                </>
                              }
                              // Every row shows its fit: a real score, or the guess word (27 Nov review: phone rows hid it).
                              ring={<FitBadge job={best ? { scores: [best] } : j} />}
                              save={<FavoriteStar jobId={j._id} favorite={!!j.favorite} className="shrink-0" />}
                              onDismiss={() => void setStatusMany({ jobIds: [j._id], status: "dismissed" }).catch(() => {})}
                            />
                        );
                      })}
                    </ul>
                  </section>
                  ),
                );
              })()}
            </div>
          )}
          {(visible.length > shown || weakCount > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {visible.length > shown && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShown(shown + PAGE * 2)}>
                  Show more ({visible.length - shown} left)
                </button>
              )}
              {weakCount > 0 && (
                <button className="btn-text" onClick={() => setShowWeak(!showWeak)}>
                  {showWeak ? "Hide looser matches" : `Show ${weakCount} looser ${weakCount === 1 ? "match" : "matches"}`}
                </button>
              )}
            </div>
          )}
        </div>

        {selected && (
          <div className="hidden lg:block">
            <div className="sticky top-20">
              <JobPanel key={selected} jobId={selected} onClose={() => router.replace(hrefWith({ job: null }), { scroll: false })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
