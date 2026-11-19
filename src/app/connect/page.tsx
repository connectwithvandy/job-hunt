"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { GmailSync, ImportChats, ImportConnections } from "@/components/forms";
import { Loading } from "@/components/Loading";

/** Profile → LinkedIn & Gmail: the data JobPipe reads to find who you know and to track replies. Set up once. */
export default function Connect() {
  const me = useQuery(api.users.me);
  if (!me) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="LinkedIn & Gmail"
        sub="Load these once. JobPipe uses them to find who you know at every company and to spot replies from employers."
      />

      <section className="card mb-8 p-6">
        <h2 className="display mb-1 text-2xl">
          {me.contactsCount
            ? `${me.contactsCount.toLocaleString()} connections loaded`
            : "Load your connections"}
        </h2>
        <ol className="mt-3 mb-5 list-decimal space-y-2 pl-5 text-sm text-ink-2">
          <li>
            Open LinkedIn&apos;s{" "}
            <a
              className="underline"
              href="https://www.linkedin.com/mypreferences/d/download-my-data"
              target="_blank"
              rel="noreferrer"
            >
              Get a copy of your data
            </a>{" "}
            page (sign in if it asks).
          </li>
          <li>
            Pick the second option, <b>&quot;Want something in particular?&quot;</b>, tick only <b>Connections</b>, and press <b>Request archive</b>. LinkedIn may ask
            for your password.
          </li>
          <li>
            Wait for LinkedIn&apos;s email, usually 10 to 30 minutes, sometimes longer. You can close this page meanwhile.
          </li>
          <li>
            Open the email, download the file, and choose it below <b>as it is</b>. No need to unzip it.
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
            <li>Choose the file LinkedIn emails you below, as it is. No need to unzip it.</li>
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

      <section className="card mb-8 p-6">
        <h2 className="display mb-1 text-2xl">Gmail</h2>
        <p className="mt-2 mb-4 text-sm text-ink-2">Read only. JobPipe spots replies, interview invites and rejections from employers and moves the job on your tracker.</p>
        <GmailSync />
      </section>
    </div>
  );
}
