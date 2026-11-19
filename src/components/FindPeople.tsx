"use client";

// The companies hiring for your roles where you know someone, best first, with people to ask for a referral.
// Lives in Messages (19 Nov: Referrals and Messages merged, so every ask and reply is in one place).
import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { OutreachCard, PeoplePicker } from "@/components/job-client";

export function FindPeople() {
  const me = useQuery(api.users.me);
  const warm = useQuery(api.contacts.warmCompanies);
  const [companiesShown, setCompaniesShown] = useState(10);
  if (!me || !warm) return <div className="h-40 animate-pulse rounded-xl bg-soft" />;
  if (me.contactsCount === 0) {
    return (
      <section className="p-1">
        <h2 className="mb-1 text-lg font-semibold">Load your LinkedIn connections first</h2>
        <p className="mt-2 mb-4 text-sm text-ink-2">JobPipe matches the people you know against every company you&apos;re looking at, then tells you who to ask for a referral. It takes LinkedIn about 10 to 30 minutes to send you the file.</p>
        <Link href="/connect" className="btn btn-primary">
          Load my connections
        </Link>
      </section>
    );
  }
  return (
    <>
        <section className="mb-10">
          <p className="mb-1 text-sm text-ink-2">{me.contactsCount.toLocaleString()} connections loaded. <Link href="/connect" className="underline">Update</Link></p>
          <p className="mb-5 text-sm text-ink-2">
            The companies hiring for your roles where you know someone, best first. Open one, tick one or two people, and their notes appear under Needs you, ready to send.
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
                        <h3 className="text-base font-semibold">
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
    </>
  );
}
