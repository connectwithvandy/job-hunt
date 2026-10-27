"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { ImportConnections } from "@/components/forms";
import { OutreachCard, PeoplePicker } from "@/components/job-client";
import { Loading } from "@/components/Loading";

export default function Network() {
  const me = useQuery(api.users.me);
  const warm = useQuery(api.contacts.warmCompanies);
  if (!me || !warm) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead title="Network" sub="Your LinkedIn connections, matched against every company you're looking at." />

      <section className="card mb-8 p-6">
        <h2 className="display mb-1 text-2xl">{me.contactsCount ? `${me.contactsCount.toLocaleString()} connections loaded` : "Load your connections"}</h2>
        <ol className="mt-3 mb-5 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>
            On LinkedIn, open{" "}
            <a className="underline" href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer">
              Get a copy of your data
            </a>
            .
          </li>
          <li>Choose &quot;Want something in particular?&quot;, tick only Connections, and request the archive.</li>
          <li>LinkedIn emails you a link, usually within 10 to 30 minutes. Unzip it and pick Connections.csv below.</li>
        </ol>
        <ImportConnections />
        <p className="mt-3 text-xs text-ink-3">
          Only names, companies, titles and profile links are kept, visible to you alone. Loading a new file replaces the old list. Nothing is ever sent on LinkedIn for you.
        </p>
      </section>

      {me.contactsCount > 0 && (
        <section>
          <h2 className="display mb-4 text-3xl">Where you know someone</h2>
          {warm.length === 0 ? (
            <div className="card p-8 text-ink-2">None of the companies in your job list match a connection yet. Add more jobs and check back.</div>
          ) : (
            <div className="space-y-6">
              {warm.map((c) => {
                const [job, ...others] = c.jobs;
                const asked = new Set(job.outreach.map((o) => o.contactId));
                const notAsked = c.people.filter((p) => !asked.has(p._id));
                return (
                  <section key={c.company} className="card p-5">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="display text-xl">{c.company}</h3>
                      <span className="text-sm text-ink-2">
                        You know {c.peopleCount} {c.peopleCount === 1 ? "person" : "people"} there
                      </span>
                    </div>
                    <Link href={`/jobs/${job._id}`} className="font-medium underline">
                      {job.title}
                    </Link>
                    {others.length > 0 && (
                      <p className="mt-1 text-xs text-ink-2">
                        Also open:{" "}
                        {others.map((o, i) => (
                          <span key={o._id}>
                            {i > 0 && ", "}
                            <Link href={`/jobs/${o._id}`} className="underline">
                              {o.title}
                            </Link>
                          </span>
                        ))}
                      </p>
                    )}
                    {job.outreach.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {job.outreach.map((o) => (
                          <OutreachCard key={o.contactId + o.message.length} jobId={job._id} o={o} cvName={`${me.resume?.name ?? "Your"} CV ${c.company}.pdf`} />
                        ))}
                      </div>
                    )}
                    {notAsked.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-1 text-sm text-ink-2">
                          {job.outreach.length ? "Others you could ask:" : "Pick one or two to ask for a referral for this job:"}
                        </p>
                        <PeoplePicker jobId={job._id} people={notAsked} best={job.outreach.length ? 0 : Math.min(2, notAsked.length)} />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
