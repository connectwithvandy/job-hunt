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
import type { Doc } from "../../convex/_generated/dataModel";
import { tallyBy } from "../../convex/lib/outcomes";
import { useCelebrateNewWins, useSetStatus, WIN_WORDS } from "@/components/Celebrate";
import { CompanyMark, DAY_STARTS_AT, FitBadge, likelyScore, bestScore, dayStart, jobTrackKey, timeAgo } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { SetupGuide } from "@/components/SetupGuide";
import { PlacesPopup } from "@/components/PlacesPopup";
import { payText, useInrRates } from "@/lib/money";
import { showCompany, showTitle } from "@/lib/tidy";
import { ago, JobRow, metaOf, stateOf, StateButton } from "@/components/JobState";
import { answerRank, justInterviewed, waitsForAnswer } from "@/lib/replies";
import { FavoriteStar, ReferralFollowUp } from "@/components/job-client";

const DAY = 86_400_000;
/** After this long, Today asks for a fresh connections file: people keep connecting. */

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
  const replyRate = resulted && resulted.total >= 5 ? resulted : null;
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
    ...quiet.map((j) => ({ key: `q${j._id}`, verb: "Follow up", main: showTitle(j.title), sub: `${showCompany(j.company)} · Applied ${ago(j.appliedAt!)} · no reply`, href: `/jobs/${j._id}#people`, mark: j, cta: "Nudge" })),
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
  const interviewTotal = jobs.filter((j) => j.status === "interview" || j.status === "offer").length;
  const offerTotal = jobs.filter((j) => j.status === "offer").length;
  // Two or more quiet applications read as one line, not a wall (19 Nov).
  const quietItems: Todo[] =
    quiet.length > 1
      ? [{ key: "quiet", verb: "Follow up", main: `${quiet.length} applications quiet for 10+ days`, sub: quiet.slice(0, 3).map((j) => j.company).join(", ") + (quiet.length > 3 ? ` and ${quiet.length - 3} more` : ""), href: "/tracker", many: quiet.length, cta: "Nudge them" }]
      : quiet.map((j) => ({ key: `q${j._id}`, verb: "Follow up", main: showTitle(j.title), sub: `${showCompany(j.company)} · Applied ${ago(j.appliedAt!)} · no reply`, href: `/jobs/${j._id}#people`, mark: j, cta: "Nudge" }));
  const followUpItems = [...hrAfterApply, ...chase.filter((t) => t.verb === "Follow up" && !t.key.startsWith("q")), ...quietItems];
  const referralItems = [...askAfterApply, ...chase.filter((t) => t.verb === "Send"), ...reach];

  // The job the guide points to: the best fit still open, else any open one.
  // Real scores first: a 68% first guess beat every real score and sent a new member to tailor for a 22% job (25 Nov walk).
  const bestToOpen = [...jobs]
    .filter((j) => j.status === "new" || j.status === "applying")
    .sort((a, b) => Number(!!b.scores?.length) - Number(!!a.scores?.length) || fit(b) - fit(a))[0];

  // The one job to do first: the best real fit (60+, the app-wide line) not applied to, else the best rough guess.
  const pick = !replies.length && !interviewed.length ? (bestNew.find((j) => (bestScore(j)?.score ?? 0) >= SKIP_BELOW) ?? bestNew.find((j) => !bestScore(j)) ?? bestNew[0]) : undefined;
  const applyList = bestNew.filter((j) => j._id !== pick?._id && !(j.postedAt && now - Date.parse(j.postedAt) > 120 * DAY)).slice(0, 8);
  // Pipeline stages, in a sales team's words. Qualified = a real fit of 60+; Proposal = a CV ready for it.
  const realFit = (j: Doc<"jobs">) => bestScore(j)?.score ?? -1;
  const qualified = openJobs.filter((j) => realFit(j) >= SKIP_BELOW).length;
  const proposal = openJobs.filter((j) => j.hasPack || j.pack).length;
  const pickStage = replies.length ? (replies[0].lastEmail?.stage === "offer" ? 5 : 4) : interviewed.length ? 4 : pick ? (pick.hasPack || pick.pack ? 2 : realFit(pick) >= SKIP_BELOW ? 1 : 0) : -1;
  const gmailOff = !me.inboxAt || msSince(me.inboxAt) > DAY;
  const replyItems = answer.filter((t) => t.key !== "gmail");

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-10">
      <div className="min-w-0">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="h1">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <span className="text-[13px] text-ink-3">
          {new Date(dayStart(now)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          {trialDay ? ` · Trial day ${trialDay} of 7` : ""}
        </span>
      </header>
      <Autopilot on={me.autopilot} last={me.lastAutopilot} now={now} newToday={openToday} found={openJobs.length} strongNow={strongAll.length} />

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

      <CelebrateWins jobs={jobs} now={now} />
      <Pipeline
        current={pickStage}
        stages={[
          { label: "Prospect", n: openJobs.length, href: "/jobs" },
          { label: "Qualified", n: qualified, href: "/jobs" },
          { label: "Proposal", n: proposal, href: "/jobs" },
          { label: "Sent", n: appliedTotal, href: "/tracker" },
          { label: "Meeting", n: interviewTotal, href: "/tracker" },
          { label: "Closed won", n: offerTotal, href: "/tracker" },
        ]}
      />
      <Goal done={appliedToday} of={APPLIES_A_DAY} />

      <DoFirst replies={replies} interviewed={interviewed} best={pick} firstCv={!jobs.some((j) => j.hasPack || j.pack)} />

      {!!interviews?.length && (
        <Group label="Interviews coming up">
          <ul>
            {interviews.map((i) => (
              <li key={i._id} className="row">
                <Link href={`/jobs/${i.jobId}`} className="min-w-0 flex-1">
                  <span className="row-title block truncate">{i.job ? `${i.job.company}: ${showTitle(i.job.title)}` : i.title}</span>
                  <span className="row-meta block">{new Date(i.start).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                </Link>
                {i.link.startsWith("https://") && (
                  <a className="btn btn-secondary btn-sm" href={i.link} target="_blank" rel="noreferrer">
                    Join ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Group>
      )}
      {(applyList.length > 0 || gettingReady.length > 0) && (
        <Group label="Apply next" more={{ href: "/jobs", text: "All jobs" }}>
          <ApplyRows ready={gettingReady} jobs={applyList} />
        </Group>
      )}
      {replyItems.length > 0 && (
        <Group label="Replies">
          <TodoList items={replyItems} />
        </Group>
      )}
      {referralItems.length > 0 && (
        <Group label="Referrals" more={{ text: `${companiesAskedToday} of ${COMPANIES_A_DAY} asked today` }}>
          <TodoList items={referralItems} />
        </Group>
      )}
      {worth.length > 0 && (
        <Group label="Worth a look" more={{ href: "/companies?tab=startups", text: "All funded companies" }}>
          <TodoList items={worth} />
        </Group>
      )}
      {!pick && !replies.length && !interviewed.length && !applyList.length && !gettingReady.length && !replyItems.length && !followUpItems.length && !referralItems.length && !interviews?.length && (
        <section className="card mb-8 p-6">
          <h2 className="h2">Nothing waiting on you</h2>
          <p className="mt-1 text-[15px] text-ink-2">New jobs arrive with the morning search. Meanwhile, find a job to add.</p>
          <Link href="/jobs" className="btn btn-secondary btn-sm mt-4">
            Find or add a job
          </Link>
        </section>
      )}
      </div>
      {/* Right column on wide screens: follow-ups, Gmail and the reply notes. Below the main list on smaller ones. */}
      <aside className="min-w-0 xl:pt-1 xl:[&_.gmail-row]:flex-col xl:[&_.gmail-row]:items-start xl:[&_.row]:flex-wrap xl:[&_.row>.btn]:ml-11">
      {followUpItems.length > 0 && (
        <Group label="Follow up">
          <TodoList items={followUpItems} />
        </Group>
      )}
      {gmailOff && (
        <section className="gmail-row card mb-8 flex flex-wrap items-center gap-3 px-5 py-4 max-[479px]:flex-col max-[479px]:items-start">
          <p className="min-w-0 flex-1 text-[15px] text-ink-2">{me.inboxAt ? "Gmail stopped checking. Recruiter replies won't show here." : "See recruiter replies here."}</p>
          <Link href="/connect#gmail" className="btn btn-secondary btn-sm">
            Connect Gmail
          </Link>
        </section>
      )}
      {emptyRoles.length > 0 && (
        <p className="mb-8 text-[13px] text-ink-3">
          {emptyRoles.map((t) => t.name).join(", ")} {emptyRoles.length === 1 ? "finds" : "find"} no jobs.{" "}
          <Link href="/tracks" className="btn-text inline-flex underline">
            Fix the role
          </Link>
        </p>
      )}
      <p className="mb-2 text-[13px] text-ink-3">
        Replies usually come 2 to 12 days after applying.{" "}
        <Link href="/tracker" className="btn-text -ml-1 inline-flex underline">
          See all applications
        </Link>
      </p>
      {replyRate && (
        <p className="mb-8 text-[13px] text-ink-3">
          {replyRate.responses} of {replyRate.total} applications with a result got a reply ({Math.round((replyRate.responses / replyRate.total) * 100)}%).{" "}
          <Link href="/tracker#working" className="btn-text inline-flex underline">
            See what&apos;s working
          </Link>
        </p>
      )}
      </aside>
    </div>
  );
}

/**
 * The search as a sales pipeline: one card, six stages. The stage holding "Do this first" gets a lime bar under it,
 * the only lime on the strip. 6 across on a computer, 3 × 2 on a phone.
 */
function Pipeline({ stages, current }: { stages: { label: string; n: number; href: string }[]; current: number }) {
  return (
    <nav aria-label="Your pipeline" className="card mt-6 max-sm:mt-3 grid grid-cols-3 overflow-hidden sm:grid-cols-6">
      {stages.map((st, i) => (
        <Link
          key={st.label}
          href={st.href}
          aria-current={i === current ? "step" : undefined}
          className={`relative min-w-0 border-line px-4 py-3 max-[359px]:px-2 ${i % 3 !== 2 ? "border-r" : "sm:border-r"} ${i === 5 ? "sm:border-r-0" : ""} ${i >= 3 ? "border-t sm:border-t-0" : ""} [@media(hover:hover)]:hover:bg-soft`}
        >
          <div className={`mono truncate ${i === current ? "!font-semibold !text-ink" : ""}`}>{st.label}</div>
          <div className={`tnum mt-1 font-[family-name:var(--font-display-face)] text-2xl font-semibold ${st.n ? "text-ink" : "text-ink-3"}`}>{st.n}</div>
          {i === current && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" aria-hidden />}
        </Link>
      ))}
    </nav>
  );
}

/** Today's goal under the strip: "1 of 5 applied today" and a short ink bar. */
function Goal({ done, of }: { done: number; of: number }) {
  return (
    <div className="mt-2 mb-8 flex items-center justify-end gap-3 text-[13px] text-ink-2 max-sm:mb-4">
      <span className="tnum">{done >= of ? "Today's goal done" : `${done} of ${of} applied today`}</span>
      <span className={`h-1 w-20 overflow-hidden rounded-[2px] bg-line-strong`} role="progressbar" aria-valuemin={0} aria-valuemax={of} aria-valuenow={Math.min(done, of)} aria-label="Applied today">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (done / of) * 100)}%` }} />
      </span>
    </div>
  );
}

/**
 * The one thing to do first: a company waiting on your answer, then an interview that just happened,
 * then your best job to apply to. Only one, so it can't be missed (19 Nov: an invite sat below the fold).
 */
function DoFirst({ replies, interviewed, best, firstCv }: { replies: Doc<"jobs">[]; interviewed: Doc<"jobs">[]; best?: Doc<"jobs">; firstCv: boolean }) {
  const setStatus = useSetStatus();
  const setQuietly = useMutation(api.jobs.setStatus);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const run = (f: () => Promise<unknown>) => {
    setBusy(true);
    void f()
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  const box = "card mb-10 p-5 sm:p-6";
  const boxTight = "card mb-10 p-4 sm:p-6";
  const eyebrow = <h2 className="mb-4 text-[13px] font-semibold text-ink-2 max-sm:mb-2">Do this first</h2>;
  const more = (n: number) =>
    n > 0 && (
      <Link href="/inbox" className="btn-text mt-2">
        {n} more in Messages
      </Link>
    );
  if (replies.length) {
    const j = replies[0];
    const s = j.lastEmail?.stage;
    const what = s === "interview" ? `${j.company} invited you to interview` : s === "offer" ? `${j.company} sent you an offer` : `${j.company}'s recruiter wrote to you`;
    return (
      <section className={box}>
        {eyebrow}
        <div className="flex flex-wrap items-center gap-4">
          <CompanyMark job={j} size={48} />
          <div className="min-w-0 flex-1 basis-52">
            <h3 className="text-lg font-semibold leading-snug">{what}</h3>
            <p className="row-meta">
              {showTitle(j.title)} · {timeAgo(new Date(j.lastEmail!.at).toISOString())}
            </p>
          </div>
          <Link href={`/inbox?job=${j._id}`} className="btn btn-primary w-full sm:w-auto">
            Reply
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
        <div className="flex flex-wrap items-center gap-4">
          <CompanyMark job={j} size={48} />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-snug">How did the {j.company} interview go?</h3>
            <p className="row-meta">{showTitle(j.title)}. Pick one so your tracker stays right.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => run(() => setStatus({ jobId: j._id, status: "interview" }))}>
            Next round
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => run(() => setStatus({ jobId: j._id, status: "offer" }))}>
            Got an offer
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => run(() => setStatus({ jobId: j._id, status: "rejected" }))}>
            Didn&apos;t go ahead
          </button>
          <button className="btn-text" disabled={busy} onClick={() => run(() => setQuietly({ jobId: j._id, status: j.status }))}>
            Still waiting
          </button>
        </div>
        <p className="mt-4 text-[15px] text-ink-2">
          A short thank-you within a day helps.{" "}
          <Link href={`/inbox?show=all&job=${j._id}`} className="font-semibold text-ink underline underline-offset-2">
            Write the thank-you note
          </Link>
        </p>
        {more(interviewed.length - 1)}
      </section>
    );
  }
  if (!best || skipped.includes(best._id)) return null;
  const score = bestScore(best);
  // A real score gets its one-line reason; a first CV is free, which is worth saying once (21 Nov: few tailored).
  const reason = score ? (firstCv && stateOf(best) === "open" ? "Your best match. Your first tailored CV is free." : score.reason.split(/(?<=\.)\s/)[0]) : null;
  return (
    <section className={boxTight}>
      {eyebrow}
      <div className="grid grid-cols-[40px_1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[48px_1fr_auto] sm:gap-y-3">
        <span className="sm:hidden">
          <CompanyMark job={best} size={40} />
        </span>
        <span className="max-sm:hidden">
          <CompanyMark job={best} size={48} />
        </span>
        <Link href={`/jobs/${best._id}`} className="col-span-3 row-start-2 block min-h-11 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <h3 className="text-lg leading-snug font-semibold">{showTitle(best.title)}</h3>
          <p className="row-meta">{metaOf(best)}</p>
        </Link>
        <span className="col-start-3 row-start-1 justify-self-end">
          <FitBadge job={best} size={44} />
        </span>
      </div>
      {reason ? (
        <p className="mt-3 max-w-[68ch] text-[15px] text-ink-2 max-sm:mt-2">{reason}</p>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3 max-sm:mt-2">Rough guess from the title. Score it on the job page for a real read.</p>
      )}
      <div className="mt-5 flex flex-col items-stretch gap-1 max-sm:mt-3 sm:flex-row sm:items-center sm:gap-3">
        <StateButton j={best} primary full />
        {stateOf(best) === "started" && (
          <a href={best.url} target="_blank" rel="noreferrer" className="btn-text justify-center">
            Open posting ↗
          </a>
        )}
        <button
          type="button"
          className="btn-text justify-center"
          onClick={() => {
            setSkipped([...skipped, best._id]);
            void setQuietly({ jobId: best._id, status: "dismissed" }).catch(() => {});
          }}
        >
          Skip
        </button>
      </div>
    </section>
  );
}

/** One group: a real heading, an optional quiet link, then its rows in one card. */
function Group({ label, more, children }: { label: string; more?: { text: string; href?: string }; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="h2">{label}</h2>
        {more &&
          (more.href ? (
            <Link href={more.href} className="btn-text">
              {more.text}
            </Link>
          ) : (
            <span className="text-[13px] text-ink-3">{more.text}</span>
          ))}
      </div>
      <div className="card overflow-hidden">{children}</div>
    </section>
  );
}

/** Started-but-not-sent first (closest to done), then the best new jobs: logo, title and one line of detail, the
 *  fit ring, the state's button, and ✕ for "not for me". Five rows, the rest one tap away. */
const STARTED_SHOWN = 2;

function ApplyRows({ ready, jobs }: { ready: Doc<"jobs">[]; jobs: Doc<"jobs">[] }) {
  const setStatus = useMutation(api.jobs.setStatus);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const rates = useInrRates();
  const started = ready.slice(0, STARTED_SHOWN);
  const moreStarted = ready.slice(STARTED_SHOWN);
  const fresh = jobs.filter((j) => !skipped.has(j._id));
  if (!started.length && !moreStarted.length && !fresh.length) return null;
  const room = Math.max(1, SHOWN - started.length - (moreStarted.length ? 1 : 0));
  const shownFresh = all ? fresh : fresh.slice(0, room);
  // Rough guesses all within a few points say nothing about which to pick, so the rings step aside.
  const shownRough = [...started, ...shownFresh].filter((j) => !bestScore(j)).map((j) => likelyScore(j.quickFit ?? 0));
  const quietRings = shownRough.length === started.length + shownFresh.length && shownRough.length > 1 && Math.max(...shownRough) - Math.min(...shownRough) < 10;
  const row = (j: Doc<"jobs">) => (
    <JobRow
      key={j._id}
      j={j}
      href={`/jobs/${j._id}`}
      meta={j.status === "applying" ? `${showCompany(j.company)} · Started, not sent yet` : metaOf(j, payText(j.salary, rates))}
      ring={quietRings && !bestScore(j) ? null : <FitBadge job={j} />}
      save={<FavoriteStar jobId={j._id} favorite={!!j.favorite} className="shrink-0" />}
      onDismiss={
        j.status === "applying"
          ? undefined
          : () => {
              setSkipped(new Set([...skipped, j._id]));
              void setStatus({ jobId: j._id, status: "dismissed" }).catch(() => {});
            }
      }
    />
  );
  return (
    <>
      <ul>
        {started.map(row)}
        {moreStarted.length > 0 && (
          <li className="row">
            <ManyMark n={moreStarted.length} />
            <Link href="/tracker" className="min-w-0 flex-1">
              <span className="row-title block truncate">
                {moreStarted.length} more started, not sent: {moreStarted.slice(0, 2).map((j) => j.company).join(", ")}
                {moreStarted.length > 2 ? " and more" : ""}
              </span>
              <span className="row-meta block">Finish them from Applications</span>
            </Link>
            <Link href="/tracker" className="btn btn-secondary btn-sm shrink-0">
              See them
            </Link>
          </li>
        )}
        {shownFresh.map(row)}
      </ul>
      {fresh.length > room && (
        <div className="border-t border-line px-3 py-1">
          <button type="button" className="btn-text" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show ${fresh.length - room} more`}
          </button>
        </div>
      )}
    </>
  );
}

/** `panel` opens in place on a click instead of going to `href`. */
/** The left box for a row that covers several companies: the count, the same size as a company logo, so it never
 *  borrows one company's logo for the whole group (19 Nov: "4 referral notes" showed Trail's T). */
function ManyMark({ n }: { n: number }) {
  return (
    <span className="tnum inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft text-[13px] font-semibold text-ink-2" aria-hidden>
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

function TodoRow({ t, arrow }: { t: Todo; arrow: string }) {
  return (
    <>
      {t.many ? <ManyMark n={t.many} /> : t.mark && <CompanyMark job={t.mark} size={32} />}
      <span className="min-w-0 flex-1 basis-48">
        <span className="row-title line-clamp-2">{t.main}</span>
        <span className="row-meta line-clamp-2">{t.sub}</span>
      </span>
      {t.cta ? <span className="btn btn-secondary btn-sm shrink-0">{t.panel && arrow === "▴" ? "Close" : t.cta}</span> : <span className="text-ink-3">{arrow}</span>}
    </>
  );
}

const SHOWN = 5;

/** The first five things to do, the rest one tap away: more read as a wall (13 Nov). */
function TodoList({ items }: { items: Todo[] }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <>
      <ul>
        {shown.map((t) => (
          <li key={t.key} className="border-t border-line first:border-t-0">
            {t.panel ? (
              <>
                <button type="button" onClick={() => setOpen(open === t.key ? null : t.key)} className="row w-full border-t-0 text-left [@media(hover:hover)]:hover:bg-soft" aria-expanded={open === t.key}>
                  <TodoRow t={t} arrow={open === t.key ? "▴" : "▾"} />
                </button>
                {open === t.key && (
                  <div className="px-4 pb-4">
                    {t.panel}
                    <Link href={t.href} className="btn-text mt-2">
                      Open the job
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <Link href={t.href} className="row border-t-0 [@media(hover:hover)]:hover:bg-soft">
                <TodoRow t={t} arrow="" />
              </Link>
            )}
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <div className="border-t border-line px-3 py-1">
          <button type="button" className="btn-text" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show ${items.length - SHOWN} more`}
          </button>
        </div>
      )}
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < DAY_STARTS_AT ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const newLine = (n: number, when: string) => `${when}: ${n} new ${n === 1 ? "job" : "jobs"}.`;

/** The morning search: off says so with a Turn on button; on is one quiet line with what the last search found. */
function Autopilot({ on, last, now, newToday, found, strongNow }: { now: number; on: boolean; newToday: number; found: number; strongNow: number; last: { at: number; added: number } | null }) {
  const setAutopilot = useMutation(api.users.setAutopilot);
  const [busy, setBusy] = useState(false);
  if (!on) {
    return (
      <div className="mb-6 max-sm:mb-3">
      <p className="flex flex-wrap items-center gap-x-2 text-[15px] text-ink-2">
        Morning search is off.
        <button
          type="button"
          className="btn-text !text-ink underline underline-offset-2"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void setAutopilot({ on: true }).finally(() => setBusy(false));
          }}
        >
          {busy ? "Turning on…" : "Turn on"}
        </button>
      </p>
      <p className="text-[13px] text-ink-3">Searches your roles at 8 every morning.</p>
      </div>
    );
  }
  const ranToday = !!last && dayStart(now) <= last.at;
  return (
    <p className="tnum mb-6 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-3 max-sm:mb-3">
      <span>
        {last
          ? // Strong fits counted across every open job, not just this morning's (19 Nov).
            `${newLine(ranToday ? newToday : last.added, ranToday ? "Today" : `Last search ${timeAgo(new Date(last.at).toISOString())}`)} ${strongNow ? `${strongNow} strong ${strongNow === 1 ? "fit" : "fits"} (75+) open to apply to.` : "No strong fits (75+) open right now."} Next search ${beforeEightInIndia() ? "today" : "tomorrow"} at 8:00.`
          : `${found ? `Your first search found ${found} ${found === 1 ? "job" : "jobs"}. The next search runs` : "Your first search runs"} ${beforeEightInIndia() ? "today" : "tomorrow"} at 8:00.`}
      </span>
      {last && strongNow > 0 && (
        <Link href="/jobs?fit=strong" className="btn-text">
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
