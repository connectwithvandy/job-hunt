"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { OutreachCard, PeoplePicker } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { MessageCard, messageKind } from "@/components/MessageCard";

export default function Network() {
  const me = useQuery(api.users.me);
  const warm = useQuery(api.contacts.warmCompanies);
  const rows = useQuery(api.jobs.messages);
  const [now] = useState(() => Date.now());
  const [companiesShown, setCompaniesShown] = useState(10);
  if (!me || !warm || !rows) return <Loading />;
  const todo = rows.filter((r) => messageKind(r, now) === "todo");
  const followup = rows.filter((r) => messageKind(r, now) === "followup");
  const waiting = rows.filter((r) => messageKind(r, now) === "waiting");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="Referrals"
        sub="A referral is the surest way past the CV pile. Send what's written, chase what's due, then pick new people to ask."
      />

      {me.contactsCount === 0 ? (
        <section className="card mb-8 p-6">
          <h2 className="display mb-1 text-2xl">Load your LinkedIn connections first</h2>
          <p className="mt-2 mb-4 text-sm text-ink-2">JobPipe matches the people you know against every company you&apos;re looking at, then tells you who to ask for a referral. It takes LinkedIn about 10 to 30 minutes to send you the file.</p>
          <Link href="/connect" className="btn btn-primary">
            Load my connections
          </Link>
        </section>
      ) : (
        <p className="mb-6 text-sm text-ink-2">
          {me.contactsCount.toLocaleString()} connections{me.chatsCount ? ` and chats with ${me.chatsCount.toLocaleString()} people` : ""} loaded.{" "}
          <Link href="/connect" className="underline">
            {me.chatsCount ? "Update" : "Add your LinkedIn chats"}
          </Link>
        </p>
      )}

      <MessageSection
        title="Send today"
        count={todo.length}
        hint="Written and ready. Copy each note, send it on LinkedIn or email, then mark it sent."
        rows={todo}
        empty="Nothing waiting to send. Pick people to ask below, or write a CV for a job to get a note for its hiring manager."
      />
      {followup.length > 0 && <MessageSection title="Follow up" count={followup.length} hint="No reply yet. Over half of replies come to a follow-up: send a new reason to reply, not a nudge." rows={followup} />}

      {me.contactsCount > 0 && (
        <section className="mb-10">
          <h2 className="display mb-1 text-2xl">Find people to ask</h2>
          <p className="mb-5 text-sm text-ink-2">
            The companies hiring for your roles where you know someone, best first. Open one, tick one or two people, and their notes join Send today.
          </p>
          {warm.length === 0 ? (
            <div className="card p-8 text-ink-2">
              None of the companies in your job list match a connection yet. Add
              more jobs and check back.
            </div>
          ) : (
            <div className="space-y-3">
              {warm.slice(0, companiesShown).map((c, rank) => {
                const [job, ...others] = c.jobs;
                const why = [
                  c.fitting > 1
                    ? `${c.fitting} roles fit you`
                    : c.fitting === 1
                      ? "1 role fits you"
                      : null,
                  c.funding ? `Raised: ${c.funding}` : null,
                  c.dream ? "On your dream list" : null,
                ].filter(Boolean);
                const asked = new Set([...job.outreach.map((o) => o.contactId), ...job.skipped]);
                const notAsked = c.people.filter((p) => !asked.has(p._id));
                return (
                  <div key={c.key}>
                    <details className="card group p-5" open={rank < 3}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
                        <h3 className="display text-xl">
                          <span className="mr-2 text-ink-3">{rank + 1}.</span>
                          {c.company}
                        </h3>
                        <span className="text-sm text-ink-2">
                          You know {c.peopleCount}{" "}
                          {c.peopleCount === 1 ? "person" : "people"} there
                          {job.outreach.length > 0 && ` · ${job.outreach.length} asked`}
                          <span className="ml-2 inline-block transition group-open:rotate-90">›</span>
                        </span>
                      </summary>
                      <div className="mt-3">
                      {why.length > 0 && (
                        <p className="mb-2 text-xs text-ink-2">
                          {why.join(" · ")}
                        </p>
                      )}
                      <Link
                        href={`/jobs/${job._id}`}
                        className="font-medium underline"
                      >
                        {job.title}
                      </Link>
                      {others.length > 0 && (
                        <p className="mt-1 text-xs text-ink-2">
                          Also open:{" "}
                          {others.map((o, i) => (
                            <span key={o._id}>
                              {i > 0 && ", "}
                              <Link
                                href={`/jobs/${o._id}`}
                                className="underline"
                              >
                                {o.title}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                      {job.outreach.length > 0 && (
                        <div className="mt-4 space-y-3">
                          {job.outreach.map((o) => (
                            <OutreachCard
                              key={o.contactId + o.message.length}
                              jobId={job._id}
                              o={o}
                              cvName={`${me.resume?.name ?? "Your"} CV ${c.company}.pdf`}
                            />
                          ))}
                        </div>
                      )}
                      {notAsked.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-1 text-sm text-ink-2">
                            {job.outreach.length
                              ? "Others you could ask:"
                              : "Pick one or two to ask for a referral for this job:"}
                          </p>
                          <PeoplePicker
                            jobId={job._id}
                            people={notAsked}
                            best={
                              job.outreach.length
                                ? 0
                                : Math.min(2, notAsked.length)
                            }
                          />
                        </div>
                      )}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
          {warm.length > companiesShown && (
            <button className="btn btn-ghost btn-sm mt-4" onClick={() => setCompaniesShown(companiesShown + 10)}>
              Show 10 more ({warm.length - companiesShown} left)
            </button>
          )}
        </section>
      )}

      {waiting.length > 0 && (
        <details className="mb-10">
          <summary className="display cursor-pointer text-2xl">Waiting for a reply · {waiting.length}</summary>
          <ul className="mt-4 space-y-5">
            {waiting.map((r) => (
              <MessageCard key={r._id} r={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function MessageSection({ title, count, hint, rows, empty }: { title: string; count: number; hint: string; rows: Parameters<typeof MessageCard>[0]["r"][]; empty?: string }) {
  return (
    <section className="mb-10">
      <h2 className="display mb-1 text-2xl">
        {title} <span className="text-ink-3">· {count}</span>
      </h2>
      <p className="mb-4 text-sm text-ink-2">{hint}</p>
      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-ink-2">{empty}</div>
      ) : (
        <ul className="space-y-5">
          {rows.map((r) => (
            <MessageCard key={r._id} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
