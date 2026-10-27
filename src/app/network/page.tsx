"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { ImportChats, ImportConnections } from "@/components/forms";
import { OutreachCard, PeoplePicker } from "@/components/job-client";
import { Loading } from "@/components/Loading";

export default function Network() {
  const me = useQuery(api.users.me);
  const warm = useQuery(api.contacts.warmCompanies);
  if (!me || !warm) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="Network"
        sub="Your LinkedIn connections, matched against every company you're looking at."
      />

      <section className="card mb-8 p-6">
        <h2 className="display mb-1 text-2xl">
          {me.contactsCount
            ? `${me.contactsCount.toLocaleString()} connections loaded`
            : "Load your connections"}
        </h2>
        <ol className="mt-3 mb-5 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>
            On LinkedIn, open{" "}
            <a
              className="underline"
              href="https://www.linkedin.com/mypreferences/d/download-my-data"
              target="_blank"
              rel="noreferrer"
            >
              Get a copy of your data
            </a>
            .
          </li>
          <li>
            Choose &quot;Want something in particular?&quot;, tick only
            Connections, and request the archive.
          </li>
          <li>
            LinkedIn emails you a link, usually within 10 to 30 minutes. Unzip
            it and pick Connections.csv below.
          </li>
        </ol>
        <ImportConnections />
        <p className="mt-3 text-xs text-ink-3">
          Only names, companies, titles and profile links are kept, visible to
          you alone. Loading a new file replaces the old list. Nothing is ever
          sent on LinkedIn for you.
        </p>
      </section>

      {me.contactsCount > 0 && (
        <section className="card mb-8 p-6">
          <h2 className="display mb-1 text-2xl">
            {me.chatsCount
              ? `Chats with ${me.chatsCount.toLocaleString()} people loaded`
              : "Load your LinkedIn chats"}
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            So the app knows who you actually talk to. People you chat with come
            first, and each referral note matches how well you know them,
            picking up where you left off.
          </p>
          <ol className="mt-3 mb-5 list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>
              On the same{" "}
              <a
                className="underline"
                href="https://www.linkedin.com/mypreferences/d/download-my-data"
                target="_blank"
                rel="noreferrer"
              >
                Get a copy of your data
              </a>{" "}
              page, tick only Messages and request the archive.
            </li>
            <li>Unzip what LinkedIn emails you and pick messages.csv below.</li>
          </ol>
          <ImportChats />
          <p className="mt-3 text-xs text-ink-3">
            Your chats are read in your browser. Only a summary per person is
            sent to the app: how many messages, when, and the last four lines,
            trimmed. Group chats are skipped. Loading a new file replaces the
            old one.
          </p>
        </section>
      )}

      {me.contactsCount > 0 && (
        <section>
          <h2 className="display mb-1 text-3xl">Your top 50 to reach out to</h2>
          <p className="mb-5 text-sm text-ink-2">
            Ranked by how many roles fit you, who you know there, fresh funding
            and your dream list. Work the Dream 20 first: one or two referral
            asks each, then apply.
          </p>
          {warm.length === 0 ? (
            <div className="card p-8 text-ink-2">
              None of the companies in your job list match a connection yet. Add
              more jobs and check back.
            </div>
          ) : (
            <div className="space-y-6">
              {warm.map((c, rank) => {
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
                const asked = new Set(job.outreach.map((o) => o.contactId));
                const notAsked = c.people.filter((p) => !asked.has(p._id));
                return (
                  <div key={c.key}>
                    {(rank === 0 || rank === 20) && (
                      <h3 className="display mt-8 mb-3 text-2xl first:mt-0">
                        {rank === 0 ? "Dream 20 · today" : "Next 30 · tomorrow"}
                      </h3>
                    )}
                    <section className="card p-5">
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="display text-xl">
                          <span className="mr-2 text-ink-3">{rank + 1}.</span>
                          {c.company}
                        </h3>
                        <span className="text-sm text-ink-2">
                          You know {c.peopleCount}{" "}
                          {c.peopleCount === 1 ? "person" : "people"} there
                        </span>
                      </div>
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
                    </section>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
