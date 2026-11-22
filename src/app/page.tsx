"use client";

import { afterApplyNudge } from "@/lib/outreachPlan";
import { useMutation, useQuery } from "convex/react";
import { isArchived } from "@/lib/archive";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { companyKey, sameRoleKey } from "../../convex/lib/company";
import { nextFollowUp, REFERRAL_FOLLOW_UP_AFTER } from "../../convex/lib/followups";
import { rankFit, SKIP_BELOW, TAILOR_FROM } from "../../convex/lib/posting";
import { openTo, readPlace } from "../../convex/lib/sources";
import { tallyBy } from "../../convex/lib/outcomes";
import type { Doc } from "../../convex/_generated/dataModel";
import { useCelebrateNewWins, useSetStatus, WIN_WORDS } from "@/components/Celebrate";
import { CompanyMark, DAY_STARTS_AT, FitBadge, likelyScore, bestScore, dayStart, jobTrackKey, timeAgo } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { SetupGuide } from "@/components/SetupGuide";
import { PlacesPopup } from "@/components/PlacesPopup";
import { payText, useInrRates } from "@/lib/money";
import { answerRank, justInterviewed, waitsForAnswer } from "@/lib/replies";
import { ReferralFollowUp } from "@/components/job-client";

const DAY = 86_400_000;
/** After this long, Today asks for a fresh connections file: people keep connecting. */
const CONNECTIONS_STALE = 30 * DAY;

/** A steady day's outreach: new companies asked for a referral, and applications sent. */
const COMPANIES_A_DAY = 10;
const APPLIES_A_DAY = 5;

/** Jobs still worth chasing: not closed, not set aside. */
const stillChasing = (status: string) => status !== "rejected" && status !== "dismissed" && status !== "offer";

function msSince(when: number) {
  return Date.now() - when;
}

/** Whether it's still before 8:00 in India (02:30 UTC), when the morning autopilot runs. */
function beforeEightInIndia() {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes() < 2 * 60 + 30;
}

/** Why a first search from onboarding failed, if one did. */
function firstSearchError() {
  try {
    return sessionStorage.getItem("firstSearchError") ?? "";
  } catch {
    return "";
  }
}

/** Whether onboarding started the first searches in the last five minutes. */
function startedFirstSearch() {
  try {
    return Date.now() - Number(sessionStorage.getItem("firstSearchAt") ?? 0) < 5 * 60_000;
  } catch {
    return false;
  }
}

export default function Today() {
  const me = useQuery(api.users.me);
  // Same query as the menu (shared, not fetched twice), so the greeting uses the same name.
  const account = useQuery(api.access.mine);
  const [searching] = useState(startedFirstSearch);
  const [searchError] = useState(firstSearchError);
  const jobs = useQuery(api.jobs.list);
  const prefs = useQuery(api.users.jobPrefs);
  const prospects = useQuery(api.prospects.list);
  const stories = useQuery(api.stories.list);
  const warm = useQuery(api.contacts.warmCompanies);
  const interviews = useQuery(api.inbox.upcoming);
  const [now] = useState(() => Date.now());
  const markSeen = useMutation(api.users.markSeen);
  useEffect(() => void markSeen().catch(() => {}), [markSeen]);
  // The tab says where you are, not the website's sales line (19 Nov walk).
  useEffect(() => {
    const before = document.title;
    document.title = "Today · JobPipe";
    return () => {
      document.title = before;
    };
  }, []);
  if (!me || !jobs) return <Loading />;
  // The name on the account first, so the greeting matches the menu; the CV name only if none was given.
  const firstName = (account?.name || me.resume?.name || "").split(" ")[0];

  // An active role whose titles find nothing: worth fixing before anything else in step 2.
  const emptyRoles = me.tracks.filter((t) => t.status === "active" && !jobs.some((j) => jobTrackKey(j, me.tracks) === t.key));

  const unscored = jobs.filter((j) => j.status === "new" && !j.scores?.length);
  // Found today isn't new: a role posted months ago is likely filled, and one in another city isn't for you.
  const place = readPlace(me.location);
  const nearby = (j: Doc<"jobs">) => j.source === "pasted" || j.source === "link" || j.location === "Not listed" || openTo(place, j.location, j.workSetting, j.title);
  const recent = (j: Doc<"jobs">) => !j.postedAt || !(msSince(Date.parse(j.postedAt)) > 30 * DAY);
  // Archived postings (closed, or older than the limit in Job preferences) never show on Today: same rule as Jobs → Archived.
  const live = (j: Doc<"jobs">) => !isArchived(j, now, prefs?.maxAgeDays);
  const strongAll = jobs
    // A closed posting or one that rules you out isn't worth the evening.
    .filter((j) => j.status === "new" && (bestScore(j)?.score ?? 0) >= 75 && live(j) && !j.brief?.blocker && nearby(j))
    .sort((a, b) => rankFit(bestScore(b)!.score, b) - rankFit(bestScore(a)!.score, a));
  const strong = strongAll.slice(0, 5);
  // The same rule as Messages' "Needs you": offers and interview invites first, then newest.
  const replies = jobs.filter((j) => waitsForAnswer(j, now)).sort((a, b) => answerRank(a) - answerRank(b) || b.lastEmail!.at - a.lastEmail!.at);
  // Interviews that already happened this week: say how it went and thank them, instead of "answer it".
  const interviewed = jobs.filter((j) => justInterviewed(j, now));
  const drafts = jobs.flatMap((j) => j.outreach.filter((o) => o.status === "draft").map((o) => ({ j, o })));
  // Follow-ups that are due: referral asks and messages to hiring managers that got no reply in a week.
  const followUps = jobs.flatMap((j) => [
    ...j.outreach.map((o) => ({ j, name: o.name, o, lastAt: o.followUps?.filter((f) => f.sentAt).at(-1)?.sentAt ?? o.sentAt, n: nextFollowUp({ sentAt: o.status === "sent" ? o.sentAt : undefined, replied: false, followUps: o.followUps }, REFERRAL_FOLLOW_UP_AFTER) })),
    ...(j.hiringContacts ?? []).map((c) => ({ j, name: c.name, o: undefined, lastAt: c.followUps?.filter((f) => f.sentAt).at(-1)?.sentAt ?? c.sentAt, n: nextFollowUp({ sentAt: c.sentAt, replied: !!c.repliedAt, followUps: c.followUps }) })),
  ]).filter((f) => f.n && f.n.dueAt <= now && stillChasing(f.j.status));
  const quiet = jobs.filter((j) => j.status === "applied" && j.appliedAt && msSince(j.appliedAt) > 10 * DAY);
  const raised = (prospects ?? [])
    .filter((p) => p.source === "funded" && p.status === "new" && msSince(p._creationTime) < 14 * DAY)
    .sort((a, b) => (b.fit?.score ?? 0) - (a.fit?.score ?? 0))
    .slice(0, 2);

  // One line about results; the full breakdown is on Applications. Under five results a rate means little.
  const resulted = tallyBy(jobs, () => "all", now).get("all");
  const replyRate = resulted && resulted.total >= SURE ? resulted : null;
  const interviewing = jobs.filter((j) => j.status === "interview");

  // What you've done since the day started (4 AM), so late nights still count and the day starts fresh each morning.
  const dayBegan = dayStart(now);
  const sentToday = (at?: number) => !!at && at >= dayBegan;
  const companiesAskedToday = new Set(
    jobs.filter((j) => j.outreach.some((o) => sentToday(o.sentAt)) || (j.hiringContacts ?? []).some((c) => sentToday(c.sentAt))).map((j) => companyKey(j.company)),
  ).size;
  const appliedToday = jobs.filter((j) => sentToday(j.appliedAt)).length;
  // Every application so far, including ones moved on to interviews or a no.
  const appliedTotal = jobs.filter((j) => j.appliedAt || ["applied", "screening", "interview", "offer", "rejected"].includes(j.status)).length;
  // The next companies from your top 50 that you haven't asked anyone at yet: a few a day, after the routine.
  const askedAt = new Set(jobs.filter((j) => j.outreach.length || (j.hiringContacts ?? []).some((c) => c.sentAt)).map((j) => companyKey(j.company)));
  const toAsk = (warm ?? []).map((c, rank) => ({ c, rank })).filter(({ c }) => !askedAt.has(c.key)).slice(0, Math.max(0, Math.min(3, COMPANIES_A_DAY - companiesAskedToday)));

  // 1. People who wrote back: companies by email, connections who answered a referral ask, hiring managers.
  const open = (j: Doc<"jobs">) => j.status === "new" || j.status === "applying";
  const answer: Todo[] = [
    // Company replies (interview invites, recruiter emails) sit in their own box at the top of the page instead.
    ...jobs.flatMap((j) =>
      j.outreach
        .filter((o) => (o.status === "replied" || o.status === "referred") && open(j))
        .map((o) => ({
          key: `o${j._id}${o.contactId}`,
          verb: o.status === "referred" ? "Apply" : "Reply",
          main: `${j.company} · ${o.status === "referred" ? `${o.name} referred you` : `${o.name} answered`}`,
          sub: o.status === "referred" ? `For ${j.title}. Apply now and thank them.` : `About your ask for ${j.title}`,
          href: `/jobs/${j._id}`,
          mark: j,
          cta: o.status === "referred" ? "Apply" : "Reply",
          primary: true,
        })),
    ),
    ...jobs.flatMap((j) =>
      (j.hiringContacts ?? [])
        .filter((c) => c.repliedAt && msSince(c.repliedAt) < 7 * DAY && stillChasing(j.status) && !["interview", "offer"].includes(j.status))
        .map((c) => ({ key: `h${j._id}${c.name}`, verb: "Reply", main: `${j.company} · ${c.name} wrote back`, sub: `${timeAgo(new Date(c.repliedAt!).toISOString())} about ${j.title}`, href: `/jobs/${j._id}`, mark: j, cta: "Reply", primary: true })),
    ),
    // Without Gmail, replies can't show up here, so "Done" would be a guess.
    ...(!me.inboxAt || msSince(me.inboxAt) > DAY
      ? [{ key: "gmail", verb: "Connect", main: me.inboxAt ? "Gmail stopped checking" : "Connect Gmail so replies show up here", sub: "Recruiter replies and interview invites land here by themselves. Set it up once under Profile → LinkedIn & Gmail.", href: "/connect", cta: "Connect" }]
      : []),
    ...(interviewing.length && stories?.length === 0
      ? [{ key: "stories", verb: "Prepare", main: "Your proof of work", sub: `${interviewing.length} interview${interviewing.length > 1 ? "s" : ""} coming. Six examples cover most questions.`, href: "/stories", cta: "Prepare" }]
      : []),
  ];

  // 2. Jobs found in the last 24 hours that fit, best first: applying early gets more replies.
  // AI-scored jobs rank above first guesses, which run high.
  const fit = (j: Doc<"jobs">) => bestScore(j)?.score ?? j.quickFit ?? 0;
  const fresh = jobs
    .filter((j) => j.status === "new" && now - j._creationTime < DAY && fit(j) >= SKIP_BELOW && live(j) && !j.brief?.blocker && nearby(j) && recent(j))
    .sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || rankFit(fit(b), b) - rankFit(fit(a), a));
  const freshIds = new Set(fresh.map((j) => j._id));
  const freshScored = fresh.filter((j) => j.scores?.length);
  const freshGuessed = fresh.filter((j) => !j.scores?.length);
  const freshUnscored = freshGuessed.length;
  // Older strong fits fill in when there's little new that the AI has scored.
  const older = strong.filter((j) => !freshIds.has(j._id)).slice(0, Math.max(0, APPLIES_A_DAY - freshScored.length));
  // A 70+ fit with no tailored CV yet: tailoring is the next step, and the one people skip (62 scored, 18 tailored, 14 Nov).
  // Not scored yet: check the fit first ("Apply" on a first guess told new people to apply before scoring, 16 Nov walk).
  const verbFor = (j: Doc<"jobs">) => (!bestScore(j) ? "Check" : bestScore(j)!.score >= TAILOR_FROM && !j.hasPack && !j.pack ? "Tailor" : "Apply");
  const applyNew = (list: Doc<"jobs">[]) =>
    list.map((j) => ({
      key: `n${j._id}`,
      verb: verbFor(j),
      main: `${j.title} at ${j.company}`,
      // Found today isn't posted today: a role up for weeks may be filled.
      sub: [j.postedAt ? `Posted ${timeAgo(j.postedAt)}` : `Found ${timeAgo(new Date(j._creationTime).toISOString())}`, bestScore(j) ? `Fit ${bestScore(j)!.score}` : `First guess ~${likelyScore(j.quickFit ?? 0)}, not scored yet`].join(" · "),
      href: `/jobs/${j._id}`,
    }));
  // AI-scored jobs first, new then older; first guesses after them, never ahead of a real score.
  const firstPick = [...freshScored.slice(0, 8), ...older, ...freshGuessed.slice(0, Math.max(0, 8 - freshScored.length))];
  // A quiet morning still fills the row: the best open jobs not applied to yet, real scores first (19 Nov: only 2 cards).
  const picked = new Set(firstPick.map((j) => j._id));
  const fillers = jobs
    .filter((j) => j.status === "new" && !picked.has(j._id) && live(j) && !j.brief?.blocker && nearby(j) && fit(j) >= SKIP_BELOW)
    .sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || rankFit(fit(b), b) - rankFit(fit(a), a))
    .slice(0, 8);
  // Shown in the order the eye reads the rings: real scores highest first, then first guesses highest first
  // (19 Nov: 84, ~50, 70, 74, 68 looked random).
  const shownFit = (j: Doc<"jobs">) => bestScore(j)?.score ?? likelyScore(j.quickFit ?? 0);
  const bestNew = [...firstPick, ...fillers].sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || shownFit(b) - shownFit(a));
  void applyNew;
  // Started but not sent: these are still to do, not live applications (19 Nov walk).
  const gettingReady = jobs.filter((j) => j.status === "applying" && j.liveCheck?.state !== "closed");
  // Fixes to the search itself sit in a short note under the list, not among the jobs to apply to (19 Nov).
  const fixes: Todo[] = [
    ...emptyRoles.map((t) => ({ key: `e${t._id}`, verb: "Fix", main: `${t.name} finds no jobs`, sub: "Its job titles may be too narrow. Add the titles companies actually use.", href: "/tracks" })),
    // One line for scoring (19 Nov: new jobs and older ones were two lines saying the same thing).
    // The Jobs page scores up to 12 at a time, so the note promises 12, not every unscored job (19 Nov: "513 jobs").
    ...(unscored.length ? [{ key: "score", verb: "Score", main: `Get real fit scores for your ${Math.min(SCORE_BATCH, unscored.length)} best new ${Math.min(SCORE_BATCH, unscored.length) === 1 ? "job" : "jobs"}`, sub: freshUnscored ? `${freshUnscored} found in the last day. The ~% is a first guess; the real score reads the whole job.` : "The ~% is a first guess; the real score reads the whole job.", href: "/jobs?fit=unscored" }] : []),
  ];

  // 3. Messages and applications with no answer yet.
  const chase: Todo[] = [
    // Many drafts read as a wall of the same line (19 Nov: 18 of 19 to-dos), so more than one becomes a single line.
    ...(drafts.length > 1
      ? [{ key: "drafts", verb: "Send", main: `${drafts.length} referral notes ready`, sub: `Written for you: ${[...new Set(drafts.map(({ j }) => j.company))].slice(0, 3).join(", ")}. Read each one, then send it.`, href: "/inbox?show=ready", many: drafts.length, cta: "Review notes", primary: true }]
      : drafts.map(({ j, o }) => ({ key: `d${j._id}${o.contactId}`, verb: "Send", main: `${j.company} · Note to ${o.name}`, sub: `Written, not sent yet · for ${j.title}`, href: `/jobs/${j._id}`, mark: j, cta: "Review note", primary: true }))),
    // A referral ask's follow-up opens right here, written and ready to copy.
    ...followUps.map(({ j, name, n, o, lastAt }) => ({
      key: `f${j._id}${name}${n!.n}`,
      verb: "Follow up",
      main: `${j.company} · Follow up with ${name.split(" ")[0]}`,
      sub: [`${ORDINAL[n!.n] ?? `${n!.n}th`} follow-up`, lastAt ? `no reply in ${Math.max(1, Math.floor(msSince(lastAt) / DAY))} days` : "no reply yet", j.title].join(" · "),
      href: `/jobs/${j._id}`,
      mark: j,
      cta: "Write follow-up",
      panel: o ? <ReferralFollowUp jobId={j._id} o={o} /> : undefined,
    })),
    ...quiet.map((j) => ({ key: `q${j._id}`, verb: "Follow up", main: `${j.company} · ${j.title}`, sub: `Applied ${timeAgo(j.appliedAt)}, no answer yet`, href: `/jobs/${j._id}`, mark: j, cta: "Nudge" })),
  ];

  // Just applied and nobody asked or messaged there yet: suggest the next way in, alongside the application (19 Nov, owner:
  // apply stays front, referral asks and HR messages run with it). Shown for 3 days after applying.
  const warmByKey = new Map((warm ?? []).map((c) => [c.key, c]));
  const applyNudges = jobs
    .map((j) => ({ j, c: warmByKey.get(companyKey(j.company)) }))
    .map(({ j, c }) => ({ j, c, kind: afterApplyNudge(j, !!c?.people.length, now) }))
    .filter((x) => x.kind);
  const nudgedCompanies = new Set(applyNudges.map(({ j }) => companyKey(j.company)));
  const askAfterApply: Todo[] = applyNudges
    .filter((x) => x.kind === "referral")
    .map(({ j, c }) => {
      const p = c!.people[0];
      return {
        key: `aa${j._id}`,
        verb: "Ask",
        main: `${j.company} · Also ask ${p.firstName} ${p.lastName} for a referral`,
        sub: [`You applied ${timeAgo(j.appliedAt)}`, p.position ? `their role: ${p.position}` : null, c!.peopleCount > 1 ? `you know ${c!.peopleCount} there` : null].filter(Boolean).join(" · "),
        href: `/jobs/${j._id}#people`,
        mark: j,
        cta: "Ask",
        primary: true,
      };
    });
  const hrAfterApply: Todo[] = applyNudges
    .filter((x) => x.kind === "hr")
    .map(({ j }) => ({
      key: `ah${j._id}`,
      verb: "Message",
      main: `${j.company} · Also message the hiring manager`,
      sub: `You applied ${timeAgo(j.appliedAt)}. A short note puts a name to your application.`,
      href: `/jobs/${j._id}#people`,
      mark: j,
      cta: "Message HR",
    }));

  // 4. New companies to open up, once the rest is done.
  const reach: Todo[] = [
    // One section for referrals: it used to repeat as a card at the top of the page too (13 Nov).
    // A company you just applied to already has its own "Also ask" row above.
    ...toAsk.filter(({ c }) => !nudgedCompanies.has(c.key)).map(({ c }) => {
      const p = c.people[0];
      return {
        key: `a${c.key}`,
        verb: "Ask",
        main: p ? `${c.company} · Ask ${p.firstName} ${p.lastName}` : `${c.company} · Find someone to ask`,
        // The job and the person's own title used to run together ("Account Executive · Corporate Growth Strategist").
        sub: [c.jobs[0]?.title ? `For ${c.jobs[0].title}` : null, p?.position ? `their role: ${p.position}` : null, c.peopleCount > 1 ? `you know ${c.peopleCount} there` : null].filter(Boolean).join(" · "),
        href: `/jobs/${c.jobs[0]._id}`,
        // The warm list carries only the job's id and title; the full job has the logo.
        mark: jobs.find((j) => j._id === c.jobs[0]?._id) ?? { company: c.company },
        cta: "Ask",
      };
    }),
  ];
  // Newly funded companies aren't referral asks: their own small group at the end.
  const worth: Todo[] = raised.map((p) => ({ key: `r${p._id}`, verb: "Reach out", main: `${p.name} · just raised money`, sub: p.funding ?? "New funding", href: `/companies?open=${p._id}`, mark: { company: p.name }, cta: "Have a look" }));

  // Trial day, shown beside the date (it used to sit in the summary line the pipeline replaced).
  const trialEndsAt = account && !account.isOwner && !account.paidUntil && !account.trialOver ? account.trialEndsAt : undefined;
  const trialDay = trialEndsAt && trialEndsAt > now ? Math.min(7, Math.max(1, 8 - Math.ceil((trialEndsAt - now) / DAY))) : null;
  // Pipeline numbers: the same rules the old summary line used, so nothing changes meaning.
  // One role listed on two boards counts once, as on the Jobs page, so both say the same number (21 Nov: 604 vs 600).
  const openJobs = [...new Map(jobs.filter((j) => (j.status === "new" || j.status === "applying") && live(j)).map((j) => [sameRoleKey(j.company, j.title), j])).values()];
  const openToday = openJobs.filter((j) => j._creationTime >= dayBegan).length;
  const repliedTotal = jobs.filter((j) => ["screening", "interview", "offer"].includes(j.status)).length;
  const interviewTotal = jobs.filter((j) => j.status === "interview" || j.status === "offer").length;
  const offerTotal = jobs.filter((j) => j.status === "offer").length;
  // "Do this first" takes the best job only when nothing more urgent is waiting; then the list starts after it.
  const firstIsJob = !replies.length && !interviewed.length && !!bestNew[0];
  const applyJobs = bestNew.filter((j) => !(j.postedAt && now - Date.parse(j.postedAt) > 120 * DAY)).slice(firstIsJob ? 1 : 0, firstIsJob ? 9 : 8);
  // Two or more quiet applications read as one line, not a wall (19 Nov).
  const quietItems: Todo[] =
    quiet.length > 1
      ? [{ key: "quiet", verb: "Follow up", main: `${quiet.length} applications quiet for 10+ days`, sub: quiet.slice(0, 3).map((j) => j.company).join(", ") + (quiet.length > 3 ? ` and ${quiet.length - 3} more` : ""), href: "/tracker", many: quiet.length, cta: "Nudge them" }]
      : quiet.map((j) => ({ key: `q${j._id}`, verb: "Follow up", main: `${j.company} · ${j.title}`, sub: `Applied ${timeAgo(j.appliedAt)}, no answer yet`, href: `/jobs/${j._id}`, mark: j, cta: "Nudge" }));
  const followUpItems = [...hrAfterApply, ...chase.filter((t) => t.verb === "Follow up" && !t.key.startsWith("q")), ...quietItems];
  const referralItems = [...askAfterApply, ...chase.filter((t) => t.verb === "Send"), ...reach];

  // The job the guide points to: the best fit still open, else any open one.
  const bestToOpen = [...jobs].filter((j) => j.status === "new" || j.status === "applying").sort((a, b) => fit(b) - fit(a))[0];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
          <span className="ml-3 text-sm font-normal text-ink-3">
            {new Date(dayStart(now)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            {trialDay ? ` · Trial day ${trialDay} of 7` : ""}
          </span>
        </h1>
        <Autopilot on={me.autopilot} last={me.lastAutopilot} now={now} found={jobs.length} strongNow={strongAll.length} newToday={openToday} />
      </header>

      {!me.placesAsked && <PlacesPopup location={me.location} workModes={me.workModes} />}
      <SetupGuide
        hold={!me.placesAsked}
        progress={{
          hasCv: !!me.resume,
          roles: me.tracks.length,
          contacts: me.contactsCount,
          jobs: jobs.length,
          scored: jobs.filter((j) => j.scores?.length).length,
          tailored: jobs.filter((j) => j.hasPack || j.pack).length,
          applied: appliedTotal,
        }}
        bestJob={bestToOpen?._id}
        foundNote={jobs.length ? firstFound(jobs, searching) : searchError ? `The first search didn't work: ${searchError} Try again on the Jobs page.` : searching ? "Finding your first jobs now. They'll appear here in a minute or two." : "Search on the Jobs page, or paste a job description."}
      />
      {me.contactsCount > 0 && me.contactsLoadedAt && now - me.contactsLoadedAt > CONNECTIONS_STALE && (
        <section className="card mb-8 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-medium">Refresh your LinkedIn connections</p>
            <p className="mt-1 text-sm text-ink-2">You loaded them {timeAgo(new Date(me.contactsLoadedAt).toISOString())}. Anyone you&apos;ve connected with since won&apos;t show up on your jobs yet.</p>
          </div>
          <Link href="/connect" className="btn btn-primary btn-sm">
            Refresh
          </Link>
        </section>
      )}

      <CelebrateWins jobs={jobs} now={now} />
      {/* Where the search stands, in the stages a sales pipeline uses (19 Nov: own layout, not a copy of another site's). */}
      <Pipeline
        stages={[
          { label: "Open jobs for you", n: openJobs.length, sub: openToday ? `+${openToday} today` : undefined, href: "/jobs" },
          { label: "Applied", n: appliedTotal, sub: `${appliedToday} of ${APPLIES_A_DAY} today`, href: "/tracker" },
          { label: "Replied", n: repliedTotal, href: "/tracker" },
          { label: "Interview", n: interviewTotal, href: "/tracker" },
          { label: "Offer", n: offerTotal, href: "/tracker" },
        ]}
      />
      <DoFirst replies={replies} interviewed={interviewed} best={bestNew[0]} verbFor={verbFor} firstCv={!jobs.some((j) => j.hasPack || j.pack)} />

      {/* Each group is its own card with a real heading: one long card with tiny grey labels read as footnotes on a phone (19 Nov). */}
      <section className="rise mb-6 grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-lg font-semibold">Then, today</h2>
          <span className="text-sm text-ink-3">
            {appliedToday >= APPLIES_A_DAY
              ? "Today's goal done"
              : `${APPLIES_A_DAY - appliedToday} more ${APPLIES_A_DAY - appliedToday === 1 ? "application reaches" : "applications reach"} today's goal`}
          </span>
        </div>
        {!!interviews?.length && (
          <Group label="Interviews coming up">
            <ul className="divide-y divide-line">
              {interviews.map((i) => (
                <li key={i._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                  <Link href={`/jobs/${i.jobId}`} className="min-w-0">
                    <span className="block font-medium">{i.job ? `${i.job.company}: ${i.job.title}` : i.title}</span>
                    <span className="block text-xs text-ink-3">{new Date(i.start).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  </Link>
                  {i.link.startsWith("https://") && (
                    <a className="btn btn-sm" href={i.link} target="_blank" rel="noreferrer">
                      Join ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Group>
        )}
        {(applyJobs.length > 0 || gettingReady.length > 0) && (
          <Group label="Apply" count={gettingReady.length + applyJobs.length} more={{ href: "/jobs", text: "All jobs →" }}>
            <ApplyRows ready={gettingReady} jobs={applyJobs} verbFor={verbFor} />
          </Group>
        )}
        {answer.length > 0 && (
          <Group label="Replies" count={answer.length}>
            <TodoList items={answer} plain group="Replies" />
          </Group>
        )}
        {followUpItems.length > 0 && (
          <Group label="Follow up" count={followUpItems.length}>
            <TodoList items={followUpItems} plain group="Follow up" />
          </Group>
        )}
        {(referralItems.length > 0 || companiesAskedToday > 0) && (
          <Group label="Referrals" count={referralItems.length} more={{ text: `Asked today ${companiesAskedToday} of ${COMPANIES_A_DAY}` }}>
            {referralItems.length > 0 ? <TodoList items={referralItems} plain group="Referrals" /> : <p className="px-3 py-3 text-sm text-ink-2">Today&apos;s asks are sent.</p>}
          </Group>
        )}
        {worth.length > 0 && (
          <Group label="Worth a look" more={{ href: "/companies?tab=startups", text: "All funded companies →" }}>
            <TodoList items={worth} plain group="Worth a look" />
          </Group>
        )}
        {fixes.length > 0 && (
          <div className="card px-4 py-3 text-xs text-ink-3">
            {fixes.map((f) => (
              <p key={f.key}>
                {f.key === "score" ? (
                  <Link href={f.href} className="text-ink-2 underline hover:text-ink">
                    {f.main}
                  </Link>
                ) : (
                  <>
                    {f.main}.{" "}
                    <Link href={f.href} className="text-ink-2 underline hover:text-ink">
                      Fix the role
                    </Link>
                  </>
                )}
              </p>
            ))}
          </div>
        )}
        {!applyJobs.length && !gettingReady.length && !answer.length && !followUpItems.length && !referralItems.length && !interviews?.length && (
          <p className="card px-4 py-4 text-sm text-ink-2">
            {me.contactsCount ? "Nothing waiting on you. Open Jobs, or find people to ask in Messages." : "Nothing waiting on you. Load your LinkedIn connections (Profile → LinkedIn & Gmail) to see who you know at each company."}
          </p>
        )}
      </section>

      <p className="px-1 text-sm text-ink-3">
        Replies usually come 2 to 12 days after applying.{" "}
        <Link href="/tracker" className="text-ink-2 underline hover:text-ink">
          See all applications
        </Link>
      </p>

      {/* What's working lives on Applications now; Today keeps one line about it (19 Nov: a fold at the very bottom). */}
      {replyRate && (
        <p className="mt-2 px-1 text-sm text-ink-3">
          {replyRate.responses} of {replyRate.total} applications with a result got a reply ({Math.round((replyRate.responses / replyRate.total) * 100)}%).{" "}
          <Link href="/tracker#working" className="text-ink-2 underline hover:text-ink">
            See what&apos;s working
          </Link>
        </p>
      )}

    </div>
  );
}

/** The search as a sales pipeline: one card, five stages, the furthest one reached lightly marked. Three then two on a phone. */
function Pipeline({ stages }: { stages: { label: string; n: number; sub?: string; href: string }[] }) {
  const furthest = stages.map((st) => st.n > 0).lastIndexOf(true);
  return (
    <section className="rise card mb-6 grid grid-cols-3 overflow-hidden sm:grid-cols-5">
      {stages.map((st, i) => (
        <Link
          key={st.label}
          href={st.href}
          className={`min-w-0 border-line px-4 py-3 hover:bg-soft ${i < stages.length - 1 ? "sm:border-r" : ""} ${i % 3 !== 2 ? "border-r" : ""} ${i >= 3 ? "border-t sm:border-t-0" : ""} ${i === furthest && i > 0 ? "bg-accent/15" : ""}`}
        >
          <div className="text-2xl font-semibold tabular-nums">{st.n}</div>
          <div className="truncate text-xs text-ink-2">{st.label}</div>
          {st.sub && <div className="truncate text-xs text-ink-3">{st.sub}</div>}
        </Link>
      ))}
    </section>
  );
}

/**
 * The one thing to do first: a company waiting on your answer, then an interview that just happened,
 * then your best job to apply to. Only one, so it can't be missed (19 Nov: an invite sat below the fold).
 */
function DoFirst({ replies, interviewed, best, verbFor, firstCv }: { replies: Doc<"jobs">[]; interviewed: Doc<"jobs">[]; best?: Doc<"jobs">; verbFor: (j: Doc<"jobs">) => string; firstCv: boolean }) {
  const setStatus = useSetStatus();
  const setQuietly = useMutation(api.jobs.setStatus);
  const [busy, setBusy] = useState(false);
  const run = (f: () => Promise<unknown>) => {
    setBusy(true);
    void f()
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  const box = "rise card mb-6 space-y-3 border-accent p-5 ring-1 ring-accent";
  const eyebrow = <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Do this first</div>;
  const more = (n: number) =>
    n > 0 && (
      <Link href="/inbox" className="block text-sm text-ink-2 underline hover:text-ink">
        +{n} more in Messages
      </Link>
    );
  if (replies.length) {
    const j = replies[0];
    // The email says what it is; the job's own status can lag behind it.
    const s = j.lastEmail?.stage;
    const what = s === "interview" ? `${j.company} invited you to interview` : s === "offer" ? `${j.company} sent you an offer` : `${j.company}'s recruiter wrote to you`;
    return (
      <section className={box}>
        {eyebrow}
        <div className="flex flex-wrap items-center gap-3">
          <CompanyMark job={j} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{what}</h2>
            <p className="text-sm text-ink-2">
              {j.title} · {timeAgo(new Date(j.lastEmail!.at).toISOString())}
            </p>
          </div>
          <Link href={`/inbox?job=${j._id}`} className="btn btn-primary btn-sm">
            Reply now
          </Link>
        </div>
        {more(replies.length - 1)}
      </section>
    );
  }
  if (interviewed.length) {
    const j = interviewed[0];
    return (
      <section className={box}>
        {eyebrow}
        <div className="flex flex-wrap items-center gap-3">
          <CompanyMark job={j} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">How did the {j.company} interview go?</h2>
            <p className="text-sm text-ink-2">{j.title}. Pick one so your tracker stays right.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => setStatus({ jobId: j._id, status: "interview" }))}>
            Next round
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => run(() => setStatus({ jobId: j._id, status: "offer" }))}>
            Got an offer
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => run(() => setStatus({ jobId: j._id, status: "rejected" }))}>
            Didn&apos;t go ahead
          </button>
          {/* No confetti for "still waiting": nothing moved. */}
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => setQuietly({ jobId: j._id, status: j.status }))}>
            Still waiting
          </button>
        </div>
        <p className="rounded-xl bg-soft px-4 py-3 text-sm text-ink-2">
          A short thank-you to the interviewer within a day helps.{" "}
          <Link href={`/inbox?show=all&job=${j._id}`} className="font-medium text-ink underline">
            Write the thank-you note
          </Link>
        </p>
        {interviewed.length > 1 && (
          <Link href="/inbox" className="block text-sm text-ink-2 underline hover:text-ink">
            +{interviewed.length - 1} more in Messages
          </Link>
        )}
      </section>
    );
  }
  if (!best) return null;
  const verb = verbFor(best);
  // Never tailored a CV: most members who set up stopped before this step (21 Nov: 24 of 92 tailored, none hit the
  // paid wall), so the card says plainly what to do and that it's free, on their best-scored job whatever its score.
  if (firstCv && verb !== "Check") {
    return (
      <section className={box}>
        {eyebrow}
        <div className="flex flex-wrap items-center gap-3">
          <FitBadge job={best} size={44} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Get your first tailored CV</h2>
            <p className="text-sm text-ink-2">
              For {best.title} at {best.company}, your best match. Takes about 2 minutes, and your first one is free.
            </p>
          </div>
          <Link href={`/jobs/${best._id}`} className="btn btn-primary btn-sm">
            Write my CV
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className={box}>
      {eyebrow}
      <div className="flex flex-wrap items-center gap-3">
        <FitBadge job={best} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">
            Apply to {best.title} at {best.company}
          </h2>
          <p className="text-sm text-ink-2">{[best.location, best.postedAt ? `Posted ${timeAgo(best.postedAt)}` : null].filter(Boolean).join(" · ")}</p>
        </div>
        <Link href={`/jobs/${best._id}`} className="btn btn-primary btn-sm">
          {verb === "Check" ? "Check the fit" : best.hasPack || best.pack ? "Apply" : "Write my CV"}
        </Link>
      </div>
    </section>
  );
}

/** One group of "Then, today" as its own card: a real heading with its count, an optional link, then its rows. */
function Group({ label, count, more, children }: { label: string; count?: number; more?: { text: string; href?: string }; children: React.ReactNode }) {
  return (
    <div className="card p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pb-2 pt-2">
        <h3 className="text-base font-semibold text-ink">
          {label}
          {!!count && <span className="ml-2 text-sm font-normal text-ink-3">{count}</span>}
        </h3>
        {more &&
          (more.href ? (
            <Link href={more.href} className="text-sm text-ink-2 hover:text-ink">
              {more.text}
            </Link>
          ) : (
            <span className="text-sm text-ink-3">{more.text}</span>
          ))}
      </div>
      {children}
    </div>
  );
}

/** Started-but-not-sent first (closest to done), then the best new jobs: logo or fit ring, "Company · title", one line
 *  of detail, one button. Five rows, the rest one tap away. Pay only when the posting lists it. */
const STARTED_SHOWN = 2;

function ApplyRows({ ready, jobs, verbFor }: { ready: Doc<"jobs">[]; jobs: Doc<"jobs">[]; verbFor: (j: Doc<"jobs">) => string }) {
  const setStatus = useMutation(api.jobs.setStatus);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const rates = useInrRates();
  // Two started applications, then the rest as one line, so new jobs aren't pushed out of sight (19 Nov: four rows).
  const started = ready.slice(0, STARTED_SHOWN);
  const moreStarted = ready.slice(STARTED_SHOWN);
  const fresh = jobs.filter((j) => !skipped.has(j._id));
  if (!started.length && !moreStarted.length && !fresh.length) return null;
  // The started rows and the "more started" line always show; new jobs fill the list up to five rows.
  const room = Math.max(1, SHOWN - started.length - (moreStarted.length ? 1 : 0));
  const shownFresh = all ? fresh : fresh.slice(0, room);
  const row = (j: Doc<"jobs">, isStarted: boolean) => {
    const verb = verbFor(j);
    const pay = payText(j.salary, rates);
    return (
      <li key={j._id} className="flex flex-wrap items-center gap-3 px-3 py-3">
        {isStarted ? <CompanyMark job={j} size={36} /> : <FitBadge job={j} size={36} />}
        <Link href={`/jobs/${j._id}`} className="min-w-0 flex-1 basis-48">
          <span className="block text-sm font-medium md:truncate">
            {j.company} · {j.title}
          </span>
          <span className="block text-xs text-ink-2 md:truncate">
            {isStarted ? "Started, not sent yet" : [pay, j.location, j.postedAt ? `Posted ${timeAgo(j.postedAt)}` : null].filter(Boolean).join(" · ")}
          </span>
        </Link>
        {!isStarted && (
          <button
            type="button"
            className="px-2 text-sm text-ink-3 hover:text-ink"
            onClick={() => {
              setSkipped(new Set([...skipped, j._id]));
              void setStatus({ jobId: j._id, status: "dismissed" }).catch(() => {});
            }}
          >
            Skip
          </button>
        )}
        <Link href={`/jobs/${j._id}`} className="btn btn-primary btn-sm shrink-0">
          {/* One rule per state: started and not sent, no real score yet, no CV for this job yet, CV ready. */}
          {isStarted ? "Finish" : verb === "Check" ? "Check the fit" : j.hasPack || j.pack ? "Apply" : "Write my CV"}
        </Link>
      </li>
    );
  };
  return (
    <>
      <ul className="divide-y divide-line">
        {started.map((j) => row(j, true))}
        {moreStarted.length > 0 && (
          <li className="flex flex-wrap items-center gap-3 px-3 py-3">
            <ManyMark n={moreStarted.length} />
            <Link href="/tracker" className="min-w-0 flex-1 basis-48">
              <span className="block text-sm font-medium md:truncate">
                {moreStarted.length} more started, not sent: {moreStarted.slice(0, 2).map((j) => j.company).join(", ")}
                {moreStarted.length > 2 ? " and more" : ""}
              </span>
              <span className="block text-xs text-ink-2 md:truncate">Finish them from Applications</span>
            </Link>
            <Link href="/tracker" className="btn btn-sm shrink-0">
              See them
            </Link>
          </li>
        )}
        {shownFresh.map((j) => row(j, false))}
      </ul>
      {fresh.length > room && (
        <button type="button" className="px-3 py-2 text-sm text-ink-3 underline hover:text-ink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show ${fresh.length - room} more`}
        </button>
      )}
    </>
  );
}

/** `panel` opens in place on a click instead of going to `href`. */
/** The left box for a row that covers several companies: the count, the same size as a company logo, so it never
 *  borrows one company's logo for the whole group (19 Nov: "4 referral notes" showed Trail's T). */
function ManyMark({ n }: { n: number }) {
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-soft text-sm font-semibold text-ink-2" aria-hidden>
      {n}
    </span>
  );
}

type Todo = {
  key: string;
  verb: string;
  main: string;
  sub: string;
  href: string;
  panel?: React.ReactNode;
  /** The company logo on the left of the row. */
  mark?: { company: string; companyLogo?: string; url?: string; sourceUrl?: string };
  /** A row standing for several companies shows this count in a plain box instead of one company's logo. */
  many?: number;
  /** The one button on the right; the whole row opens the same place. */
  cta?: string;
  primary?: boolean;
};

const ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/** Steps forward that happened without a click (Gmail moved a job, a recruiter replied), celebrated once each. */
function CelebrateWins({ jobs, now }: { jobs: Doc<"jobs">[]; now: number }) {
  const week = now - 7 * DAY;
  const wins = jobs.flatMap((j) => [
    ...((j.status === "screening" || j.status === "interview" || j.status === "offer") && (j.updatedAt ?? j._creationTime) > week
      ? [{ key: `${j._id}:${j.status}`, message: `${j.company}: ${WIN_WORDS[j.status]}` }]
      : []),
    ...(j.hiringContacts ?? [])
      .filter((c) => c.repliedAt && c.repliedAt > week)
      .map((c) => ({ key: `${j._id}:reply:${c.name}`, message: `${c.name} replied about ${j.title}. Momentum!` })),
  ]);
  useCelebrateNewWins(wins);
  return null;
}

/** Each kind of task in its own colour: lime to apply, cyan for replies, violet to follow up, pink to prepare. */
const VERB_TONE: Record<string, string> = {
  Apply: "text-accent",
  Reply: "text-cyan",
  "Follow up": "text-violet",
  Send: "text-violet",
  Score: "text-pink",
  Prepare: "text-pink",
  Fix: "text-pink",
  Connect: "text-ink-3",
};

function TodoRow({ t, arrow, group }: { t: Todo; arrow: string; group?: string }) {
  return (
    <>
      {t.many ? <ManyMark n={t.many} /> : t.mark && <CompanyMark job={t.mark} size={36} />}
      <span className="min-w-0 flex-1 basis-48">
        {/* Inside a group the header says what kind of task it is, so rows carry no coloured label of their own (19 Nov). */}
        {!group && <span className={`block text-[11px] font-semibold uppercase tracking-wide ${VERB_TONE[t.verb] ?? "text-accent"}`}>{t.verb}</span>}
        <span className="block text-sm font-medium md:truncate">{t.main}</span>
        {/* Whole on a phone: one cut-off line showed a third of "Recruiter replies…" at 390px (13 Nov). */}
        <span className="block text-xs text-ink-2 md:truncate">{t.sub}</span>
      </span>
      {t.cta ? <span className={`btn btn-sm shrink-0 ${t.primary ? "btn-primary" : ""}`}>{t.panel && arrow === "▴" ? "Close" : t.cta}</span> : <span className="nudge text-ink-3">{arrow}</span>}
    </>
  );
}

const SHOWN = 5;
/** How many jobs one "Get real fit scores" press scores on the Jobs page. */
const SCORE_BATCH = 12;
/** A percentage means something from this many results; below it, "1 of 3" says it honestly. */
const SURE = 5;

/** The first five things to do, the rest one tap away: more read as a wall (13 Nov). */
function TodoList({ items, plain, group }: { items: Todo[]; plain?: boolean; group?: string }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div className={plain ? "" : "card p-2"}>
      <ul className="divide-y divide-line">
        {shown.map((t) => (
          <li key={t.key}>
            {t.panel ? (
              <>
                <button type="button" onClick={() => setOpen(open === t.key ? null : t.key)} className="group flex w-full flex-wrap items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-soft" aria-expanded={open === t.key}>
                  <TodoRow t={t} group={group} arrow={open === t.key ? "▴" : "▾"} />
                </button>
                {open === t.key && (
                  <div className="px-3 pb-3">
                    {t.panel}
                    <Link href={t.href} className="mt-2 inline-block text-xs text-ink-3 underline hover:text-ink">
                      Open the job
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <Link href={t.href} className="group flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 hover:bg-soft">
                <TodoRow t={t} group={group} arrow="→" />
              </Link>
            )}
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <button type="button" className="px-3 py-2 text-sm text-ink-3 underline hover:text-ink" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show ${items.length - SHOWN} more`}
        </button>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < DAY_STARTS_AT ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// Today counts every open job added today (morning search, weekly finder, email, by hand), the same number as the
// "+N today" under Open jobs, so the two never disagree (22 Nov: "This morning: 2 new jobs" beside "+4 today").
const newLine = (n: number, when: string) => `${when}: ${n} new ${n === 1 ? "job" : "jobs"}.`;

/** The morning search-and-score switch, and what the last run found. */
function Autopilot({ on, last, now, found, strongNow, newToday }: { now: number; on: boolean; found: number; strongNow: number; newToday: number; last: { at: number; added: number; scored: number; strong: number; funded?: number; failed?: string[] } | null }) {
  const setAutopilot = useMutation(api.users.setAutopilot);
  // Off: a clear card, since nothing arrives without it.
  if (!on) {
    return (
      <div className="card mt-4 flex flex-wrap items-center gap-3 p-4 text-sm">
        <p className="flex-1 text-ink-2">Morning search is off. Turn it on and every morning at 8 we search all your roles and score what&apos;s new.</p>
        <button className="btn btn-primary btn-sm" onClick={() => void setAutopilot({ on: true })}>
          Turn on
        </button>
      </div>
    );
  }
  // On: one line under the greeting, what this morning brought, before the to-dos (13 Nov: it sat at the bottom).
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
      <span>
        {last
          ? // Strong fits counted across every open job, not just this morning's (19 Nov: "0 strong fits" beside an 84% card).
            `${newLine(dayStart(now) <= last.at ? newToday : last.added, dayStart(now) <= last.at ? "Today" : `Last search ${timeAgo(new Date(last.at).toISOString())}`)} ${strongNow ? `${strongNow} strong ${strongNow === 1 ? "fit" : "fits"} (75+) open to apply to.` : "No strong fits (75+) open right now."}`
          : // Signing up runs a first search, so a new person already has jobs (14 Nov: this said "runs tomorrow" beside 75 found).
            `${found ? `Your first search found ${found} ${found === 1 ? "job" : "jobs"}; the likeliest are below. The next search runs` : "Your first search runs"} ${beforeEightInIndia() ? "today" : "tomorrow"} at 8 in the morning.`}
      </span>
      {last && strongNow > 0 && (
        <Link href="/jobs?fit=strong" className="text-accent underline">
          See strong fits
        </Link>
      )}
    </p>
  );
}

/** The first-steps line once jobs are in: right after sign-up the best few are being scored by themselves. */
function firstFound(jobs: Doc<"jobs">[], searching: boolean) {
  const scored = jobs.filter((j) => j.scores?.length);
  const good = scored.filter((j) => (bestScore(j)?.score ?? 0) >= SKIP_BELOW).length;
  if (good) return `${jobs.length} found, ${good} worth applying to. Open Jobs to see why each one fits.`;
  if (scored.length)
    return `${jobs.length} found. The AI scored the ${scored.length} likeliest and none fits well yet: add another role under Profile → Roles, or check back after tomorrow's search.`;
  return searching ? `${jobs.length} found. Scoring the best ones now, about a minute.` : `${jobs.length} found. Score them to see which fit.`;
}
