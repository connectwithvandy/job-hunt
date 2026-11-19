"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { CompanyMark, timeAgo } from "@/components/bits";
import { FindPeople } from "@/components/FindPeople";
import { DirectNote, EmailDraft, HiringContacts, JobEmails, OutreachCard } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import type { MessageRow } from "@/components/MessageCard";
import { companyLine, firstName, personRows, type PersonRow } from "@/lib/messageRows";
import { answerRank, waitsForAnswer } from "@/lib/replies";

/**
 * Messages, in two tabs (19 Nov rebuild: the old one mixed company emails, referral asks and HR notes under four
 * filter chips, and the owner found it messy). "From companies": one row per company that emailed you. "Your
 * outreach": one row per person you asked or wrote to. Each is an inbox: the list on the left, the selected one on
 * the right with its next step. A dot means it needs you; those come first.
 */
export default function InboxPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inbox />
    </Suspense>
  );
}

type Tab = "companies" | "outreach";

function Inbox() {
  const me = useQuery(api.users.me);
  const jobs = useQuery(api.jobs.list);
  const written = useQuery(api.jobs.messages);
  const gmail = useQuery(api.google.status);
  const params = useSearchParams();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  if (!me || !jobs || !written) return <Loading />;

  // From companies: jobs with at least one email, the ones waiting on you first, then newest.
  const companies = jobs
    .filter((j) => j.lastEmail)
    .map((j) => ({ j, ...companyLine(j, now), at: j.lastEmail!.at }))
    .sort((a, b) => Number(b.needs) - Number(a.needs) || (a.needs && waitsForAnswer(a.j, now) ? answerRank(a.j) : 9) - (b.needs && waitsForAnswer(b.j, now) ? answerRank(b.j) : 9) || b.at - a.at);
  // Your outreach: one row per person, most urgent first.
  const people = personRows(written, now);
  const byJob = new Map(written.map((r) => [r._id as string, r]));

  // Old links still land in the right place: ?show=ready/waiting/find → outreach, ?show=needs → wherever something waits.
  const show = params.get("show");
  const jobParam = params.get("job");
  const wantsOutreach = show === "ready" || show === "waiting" || show === "find";
  const companiesNeed = companies.some((c) => c.needs);
  const tab: Tab =
    (params.get("tab") as Tab | null) ??
    (wantsOutreach ? "outreach" : show === "needs" ? (companiesNeed || !people.some((p) => p.needs) ? "companies" : "outreach") : jobParam && !companies.some((c) => c.j._id === jobParam) && people.some((p) => p.jobId === jobParam) ? "outreach" : "companies");
  const finding = show === "find";

  // What's selected: an explicit pick (from a click or a link) shows the reading pane on a phone too.
  const explicit = tab === "companies" ? jobParam : (params.get("p") ?? (jobParam ? (people.find((p) => p.jobId === jobParam)?.key ?? null) : null));
  const picked = explicit ?? (tab === "companies" ? (companies[0]?.j._id ?? null) : (people[0]?.key ?? null));

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`/inbox?${next.toString()}`, { scroll: false });
  };
  const account = gmail?.email || me.email;
  const myName = me.resume?.name ?? "";

  const switchTo = (t: Tab) => go({ tab: t, show: null, job: null, p: null });
  const segment = (t: Tab, label: string, count: number) => (
    <button
      type="button"
      onClick={() => switchTo(t)}
      aria-pressed={tab === t}
      className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap ${tab === t ? "bg-card font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
    >
      {label}
      {count > 0 && <span className="ml-1.5 text-xs text-ink-3">{count}</span>}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <div className="flex flex-wrap items-center gap-3">
          {tab === "outreach" && (
            <button type="button" onClick={() => go({ show: finding ? null : "find", p: null, job: null })} className="text-sm text-ink-2 underline hover:text-ink">
              {finding ? "← Back to your outreach" : "+ Find people to ask"}
            </button>
          )}
          <div className="inline-flex rounded-full bg-soft p-1" role="group" aria-label="Which messages">
            {segment("companies", "From companies", companies.filter((c) => c.needs).length)}
            {segment("outreach", "Your outreach", people.filter((p) => p.needs).length)}
          </div>
        </div>
      </div>

      {tab === "outreach" && finding ? (
        <FindPeople />
      ) : tab === "companies" && companies.length === 0 ? (
        <Empty>
          No emails from companies yet.{" "}
          {!gmail?.email && (
            <>
              <Link href="/connect" className="underline">
                Connect Gmail
              </Link>{" "}
              in Profile → LinkedIn &amp; Gmail so replies show up here.
            </>
          )}
        </Empty>
      ) : tab === "outreach" && people.length === 0 ? (
        <Empty>
          No referral asks or HR notes yet. Open a job and use Ask for a referral, or{" "}
          <button type="button" className="underline" onClick={() => go({ show: "find" })}>
            find people to ask
          </button>
          .
        </Empty>
      ) : (
        <div className="card grid min-h-[60vh] overflow-hidden md:grid-cols-[21rem_minmax(0,1fr)]">
          <ul className={`max-h-[75vh] overflow-y-auto border-line md:border-r ${explicit ? "hidden md:block" : ""}`}>
            {tab === "companies"
              ? companies.map((c) => (
                  <Row key={c.j._id} selected={c.j._id === picked} onClick={() => go({ job: c.j._id })} mark={<CompanyMark job={c.j} size={34} />} title={c.j.company} line={`${c.text} · ${c.j.title}`} at={c.at} needs={c.needs} />
                ))
              : people.map((p) => (
                    <Row
                      key={p.key}
                      selected={p.key === picked}
                      onClick={() => go({ p: p.key, job: null })}
                      mark={<CompanyMark job={{ company: p.company }} size={34} />}
                      title={p.kind === "find" ? `${p.name} · ${p.company}` : `${firstName(p.name)} · ${p.company}`}
                      line={p.line}
                      at={p.at}
                      needs={p.needs}
                    />
                  ))}
          </ul>
          <section className={`min-w-0 p-5 ${explicit ? "" : "hidden md:block"}`}>
            {explicit && (
              <button type="button" className="mb-4 text-sm text-ink-2 hover:text-ink md:hidden" onClick={() => go({ job: null, p: null })}>
                ← Back
              </button>
            )}
            {tab === "companies" ? (
              <CompanyPane job={companies.find((c) => c.j._id === picked)?.j} account={account} myName={myName} />
            ) : (
              <PersonPane row={people.find((p) => p.key === picked)} r={byJob.get(people.find((p) => p.key === picked)?.jobId ?? "")} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-sm text-ink-2">{children}</div>;
}

/** One line in the list: logo, who, one plain line, when, and a dot when it needs you. No buttons here. */
function Row({ selected, onClick, mark, title, line, at, needs }: { selected: boolean; onClick: () => void; mark: React.ReactNode; title: string; line: string; at: number; needs: boolean }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-soft ${selected ? "bg-soft" : ""}`}>
        {mark}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${needs ? "font-semibold" : "font-medium"}`}>{title}</span>
          <span className="block truncate text-xs text-ink-2">{line}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11px] text-ink-3">{timeAgo(at)}</span>
          <span className={`h-2 w-2 rounded-full ${needs ? "bg-violet" : "bg-transparent"}`} aria-label={needs ? "Needs you" : undefined} />
        </span>
      </button>
    </li>
  );
}

function PaneHead({ job, sub }: { job: { _id: Id<"jobs">; company: string; title: string; companyLogo?: string }; sub?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <CompanyMark job={job} size={40} />
        <div className="min-w-0">
          <div className="font-semibold">{job.company}</div>
          <div className="text-sm text-ink-2">{job.title}</div>
          {sub && <div className="text-xs text-ink-3">{sub}</div>}
        </div>
      </div>
      <Link href={`/jobs/${job._id}`} className="text-sm text-ink-2 underline hover:text-ink">
        Open the job →
      </Link>
    </div>
  );
}

/** A company's emails with the next step on top (how did it go, reply, or the interview coming up). */
function CompanyPane({ job, account, myName }: { job?: Doc<"jobs">; account: string; myName: string }) {
  const emails = useQuery(api.inbox.thread, job ? { jobId: job._id } : "skip");
  if (!job) return <p className="text-sm text-ink-3">Pick a company on the left.</p>;
  return (
    <>
      <PaneHead job={job} />
      {!emails ? (
        <div className="h-40 animate-pulse rounded-xl bg-soft" />
      ) : emails.length ? (
        // key: a new company starts with its newest email open again.
        <JobEmails key={job._id} emails={emails} company={job.company} account={account} meetingEndAt={job.meetingEndAt} job={job} myName={myName} />
      ) : (
        <p className="text-sm text-ink-3">No emails saved for this job.</p>
      )}
    </>
  );
}

/** One person: the note to send or the follow-up that's due, with Copy and open and the "Did you send it?" check. */
function PersonPane({ row, r }: { row?: PersonRow; r?: MessageRow }) {
  if (!row || !r) return <p className="text-sm text-ink-3">Pick a person on the left.</p>;
  const job = { _id: r._id, company: r.company, title: r.title };
  if (row.kind === "referral") {
    const o = r.outreach.find((x) => `ref:${r._id}:${x.contactId}` === row.key);
    if (!o) return null;
    return (
      <>
        <PaneHead job={job} sub={`Referral ask · ${row.line}`} />
        <OutreachCard jobId={r._id} o={o} cvName={`CV ${r.company}.pdf`} />
        {o.status === "sent" && <p className="mt-3 text-xs text-ink-3">Two follow-ups at most, two days apart. After that, JobPipe stops reminding you.</p>}
      </>
    );
  }
  if (row.kind === "hr") {
    const id = row.key.split(":")[2];
    return (
      <>
        <PaneHead job={job} sub={`Hiring manager or HR · ${row.line}`} />
        <HiringContacts owner={{ jobId: r._id }} contacts={r.hiringContacts} note={r.directNote} emailSubject={r.emailSubject} email={r.email} only={id} />
        {row.rank === 0 || row.rank === 2 ? <p className="mt-3 text-xs text-ink-3">Two follow-ups at most, a week apart. After that, JobPipe stops reminding you.</p> : null}
      </>
    );
  }
  // A note for the hiring manager is ready but nobody's saved to send it to.
  return (
    <>
      <PaneHead job={job} sub="A note for the hiring manager is written" />
      <p className="mb-3 text-sm text-ink-2">Find the hiring manager or someone in HR on LinkedIn, add them here, then send the note.</p>
      <HiringContacts owner={{ jobId: r._id }} contacts={r.hiringContacts} note={r.directNote} emailSubject={r.emailSubject} email={r.email} />
      {r.directNote && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">The LinkedIn note</summary>
          <div className="mt-2">
            <DirectNote key={r.packCreatedAt} jobId={r._id} text={r.directNote} />
          </div>
        </details>
      )}
      {r.email && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium">The email</summary>
          <div className="mt-2">
            <EmailDraft key={r.packCreatedAt} jobId={r._id} subject={r.emailSubject ?? ""} body={r.email} />
          </div>
        </details>
      )}
    </>
  );
}
