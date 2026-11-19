"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STATUS_LABELS } from "../../../convex/lib/defaults";
import { CompanyMark, timeAgo } from "@/components/bits";
import { FindPeople } from "@/components/FindPeople";
import { JobEmails } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { MessageCard, messageKind, type MessageRow } from "@/components/MessageCard";

/**
 * Every conversation about a job in one place (19 Nov: Referrals and Messages merged): referral asks to people you
 * know, notes to the hiring manager or HR, and emails from the company, each with where it stands. Like
 * Dreamwork's Messages: the list on the left, the conversation on the right. "Find people to ask" starts new ones.
 */
export default function InboxPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inbox />
    </Suspense>
  );
}

type Filter = "needs" | "waiting" | "all" | "find";
const STAGE: Record<string, string> = { applied: "Application received", screening: "Recruiter wrote", interview: "Interview invite", offer: "Offer", rejected: "A no" };

function Inbox() {
  const me = useQuery(api.users.me);
  const jobs = useQuery(api.jobs.list);
  const written = useQuery(api.jobs.messages);
  const gmail = useQuery(api.google.status);
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [now] = useState(() => Date.now());
  if (!me || !jobs || !written) return <Loading />;

  const outreachById = new Map(written.map((r) => [r._id as string, r]));
  const ids = new Set<string>([...written.map((r) => r._id as string), ...jobs.filter((j) => j.lastEmail).map((j) => j._id as string)]);
  // One row per job: what's going on there, and whether it needs you now.
  const threads = jobs
    .filter((j) => ids.has(j._id))
    .map((j) => {
      const r = outreachById.get(j._id);
      const kind = r ? messageKind(r, now) : "done";
      const emailWaiting = !!j.lastEmail && !j.lastEmail.repliedAt && j.lastEmail.stage !== "applied" && j.lastEmail.stage !== "rejected";
      const asked = r?.outreach.filter((o) => o.status !== "draft").length ?? 0;
      const answered = r?.outreach.filter((o) => o.status === "replied" || o.status === "referred").length ?? 0;
      const hm = r?.hiringContacts.filter((c) => c.sentAt).length ?? 0;
      const status = emailWaiting
        ? `${STAGE[j.lastEmail!.stage] ?? "Email"}: answer it`
        : kind === "followup"
          ? "Follow-up due"
          : kind === "todo"
            ? "Written, not sent yet"
            : answered
              ? `${answered} replied`
              : kind === "waiting"
                ? "Waiting for a reply"
                : j.lastEmail
                  ? (STAGE[j.lastEmail.stage] ?? "Email")
                  : "Done";
      const parts = [asked ? `${asked} referral ${asked === 1 ? "ask" : "asks"}` : null, hm ? `${hm} to hiring manager or HR` : null, j.lastEmail ? "emails" : null].filter(Boolean);
      const at = Math.max(j.lastEmail?.at ?? 0, r?.updatedAt ?? 0);
      return { j, r, needs: emailWaiting || kind === "followup" || kind === "todo", waiting: !emailWaiting && kind === "waiting", status, parts, at };
    })
    .sort((a, b) => Number(b.needs) - Number(a.needs) || b.at - a.at);

  const counts = { needs: threads.filter((t) => t.needs).length, waiting: threads.filter((t) => t.waiting).length, all: threads.length };
  const filter = (params.get("show") as Filter | null) ?? (counts.needs ? "needs" : "all");
  const words = q.trim().toLowerCase();
  const shown = threads.filter((t) => (filter === "needs" ? t.needs : filter === "waiting" ? t.waiting : true) && (!words || `${t.j.company} ${t.j.title}`.toLowerCase().includes(words)));
  const picked = (params.get("job") as Id<"jobs"> | null) ?? shown[0]?.j._id ?? null;
  const open = threads.find((t) => t.j._id === picked);
  const account = gmail?.email || me.email;
  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`/inbox?${next.toString()}`, { scroll: false });
  };
  const chip = (key: Filter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => go({ show: key, job: null })}
      className={`rounded-full border px-3 py-1 text-sm ${filter === key ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
      <p className="mt-1 mb-4 text-sm text-ink-2">Referral asks, notes to hiring managers and HR, and replies from companies, with what to do next on each.</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip("needs", `Needs you · ${counts.needs}`)}
        {chip("waiting", `Waiting · ${counts.waiting}`)}
        {chip("all", `All · ${counts.all}`)}
        <span className="flex-1" />
        {chip("find", "+ Find people to ask")}
      </div>

      {filter === "find" ? (
        <FindPeople />
      ) : threads.length === 0 ? (
        <div className="card p-6 text-sm text-ink-2">
          Nothing here yet. Ask someone you know for a referral (<button type="button" className="underline" onClick={() => go({ show: "find" })}>find people to ask</button>), or write a CV for a job to get a note for its hiring manager.
          {!gmail?.email && (
            <>
              {" "}
              <Link href="/connect" className="underline">
                Connect Gmail
              </Link>{" "}
              and replies from companies show up here too.
            </>
          )}
        </div>
      ) : (
        <div className="card grid min-h-[60vh] overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="border-b border-line md:border-r md:border-b-0">
            <div className="p-3">
              <input className="field !py-2 text-sm" placeholder="Search company or role" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {shown.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-ink-3">{filter === "needs" ? "Nothing needs you right now." : "Nothing here."}</p>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto">
                {shown.map((t) => (
                  <li key={t.j._id}>
                    <button
                      type="button"
                      onClick={() => go({ job: t.j._id })}
                      className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-soft ${t.j._id === picked ? "bg-soft" : ""}`}
                    >
                      <CompanyMark job={t.j} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${t.needs ? "font-semibold" : "font-medium"}`}>{t.j.company}</span>
                          {t.at > 0 && <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(new Date(t.at).toISOString())}</span>}
                        </span>
                        <span className="block truncate text-xs text-ink-2">{t.j.title}</span>
                        <span className={`block truncate text-xs ${t.needs ? "font-medium text-ink" : "text-ink-3"}`}>
                          {t.status}
                          {t.parts.length ? ` · ${t.parts.join(" · ")}` : ""}
                        </span>
                      </span>
                      {t.needs && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Needs you" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <section className="min-w-0 space-y-6 p-5">
            {open ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CompanyMark job={open.j} size={40} />
                    <div>
                      <div className="font-medium">{open.j.company}</div>
                      <div className="text-sm text-ink-2">
                        {open.j.title} · {open.j.status === "new" ? "Not applied yet" : (STATUS_LABELS[open.j.status] ?? open.j.status)}
                      </div>
                    </div>
                  </div>
                  <Link href={`/jobs/${open.j._id}`} className="btn btn-ghost btn-sm">
                    Open the job
                  </Link>
                </div>
                {open.j.lastEmail && <Thread jobId={open.j._id} company={open.j.company} account={account} />}
                {open.r && <Outreach r={open.r} />}
              </>
            ) : (
              <p className="text-sm text-ink-3">Pick a conversation on the left.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Referral asks and hiring-manager notes for one job, each with its status and follow-ups. */
function Outreach({ r }: { r: MessageRow }) {
  return (
    <ul>
      <MessageCard r={r} bare />
    </ul>
  );
}

function Thread({ jobId, company, account }: { jobId: Id<"jobs">; company: string; account: string }) {
  const emails = useQuery(api.inbox.thread, { jobId });
  if (!emails) return <div className="h-40 animate-pulse rounded-xl bg-soft" />;
  if (!emails.length) return null;
  return <JobEmails emails={emails} company={company} account={account} />;
}
