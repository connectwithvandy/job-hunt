"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { ImportConnections } from "@/components/forms";
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
            <ul className="card divide-y divide-line">
              {warm.map((c) => (
                <li key={c.company}>
                  <Link href={`/jobs/${c.jobId}`} className="flex items-center justify-between px-5 py-3 hover:bg-soft">
                    <span className="font-medium">{c.company}</span>
                    <span className="text-sm text-ink-2">
                      {c.people} {c.people === 1 ? "person" : "people"} · {c.jobs} {c.jobs === 1 ? "job" : "jobs"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
