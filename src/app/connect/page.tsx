"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { GmailSync, ImportChats, ImportConnections, RequestedNote } from "@/components/forms";
import { Loading } from "@/components/Loading";

const LINKEDIN_EXPORT = "https://www.linkedin.com/mypreferences/d/download-my-data";

/** Where a card stands, in one line at its top: done, or what's missing. */
function Status({ done, text }: { done: boolean; text: string }) {
  return (
    <p className={`mb-3 flex items-center gap-2 text-sm font-medium ${done ? "text-good" : "text-ink-3"}`}>
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${done ? "bg-good" : "bg-line"}`} />
      {text}
    </p>
  );
}

/**
 * The LinkedIn steps as they really happen (19 Nov: people got stuck because the old steps said "download the file"
 * while LinkedIn's email only has a link, and nothing said they could leave and come back).
 */
function LinkedInSteps({ tick }: { tick: "Connections" | "Messages" }) {
  return (
    <ol className="mt-3 mb-4 list-decimal space-y-2 pl-5 text-sm text-ink-2">
      <li>
        Open LinkedIn&apos;s{" "}
        <a className="underline" href={LINKEDIN_EXPORT} target="_blank" rel="noreferrer">
          Get a copy of your data
        </a>{" "}
        page and sign in if it asks.
      </li>
      <li>
        Choose <b>&quot;Want something in particular?&quot;</b>, tick only <b>{tick}</b>, and press <b>Request archive</b>. LinkedIn may ask for your
        password.
      </li>
      <li>
        LinkedIn emails you in about 10 to 30 minutes: <b>&quot;Your LinkedIn data archive is ready&quot;</b>. You can leave now and come back to{" "}
        <b>Profile → LinkedIn &amp; Gmail</b>.
      </li>
      <li>
        In that email, click <b>Download archive</b>. LinkedIn may ask you to sign in again. The file is called something like{" "}
        <b>Basic_LinkedInDataExport_….zip</b>. Don&apos;t unzip it.
      </li>
      <li>Choose that file below and press the button.</li>
    </ol>
  );
}

/** Profile → LinkedIn & Gmail: the data JobPipe reads to find who you know and to track replies. Set up once. */
export default function Connect() {
  const me = useQuery(api.users.me);
  const google = useQuery(api.google.status);
  if (!me) return <Loading />;
  const gmailOn = !!google?.connected || (me.inboxAt !== null && me.inboxAt !== undefined);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="LinkedIn & Gmail"
        sub="Load these once. JobPipe uses them to find who you know at every company and to spot replies from employers."
      />
      <p className="mb-6 text-sm text-ink-3">The LinkedIn steps are easier on a laptop: the file is hard to find on a phone.</p>

      <section className="card mb-8 p-6">
        <Status
          done={me.contactsCount > 0}
          text={me.contactsCount ? `${me.contactsCount.toLocaleString()} connections loaded` : "Not loaded yet"}
        />
        <h2 className="display mb-1 text-2xl">{me.contactsCount ? "Your LinkedIn connections" : "Load your LinkedIn connections"}</h2>
        <p className="text-sm text-ink-2">LinkedIn&apos;s download no longer says where people work, so this now helps less. The LinkedIn search buttons on each job are the surer way to find who you know.</p>
        <LinkedInSteps tick="Connections" />
        <div className="mb-4">
          <RequestedNote storageKey="guide-connections-requested" what="connections" />
        </div>
        <ImportConnections />
        <p className="mt-3 text-xs text-ink-3">
          Only names, companies, titles and profile links are kept, visible to you alone. Loading a new file replaces the old list. Nothing is ever sent on
          LinkedIn for you.
        </p>
      </section>

      {me.contactsCount > 0 && (
        <section className="card mb-8 p-6">
          <Status
            done={me.chatsCount > 0}
            text={me.chatsCount ? `Chats with ${me.chatsCount.toLocaleString()} people loaded` : "Not loaded yet (optional)"}
          />
          <h2 className="display mb-1 text-2xl">{me.chatsCount ? "Your LinkedIn chats" : "Load your LinkedIn chats"}</h2>
          <p className="mt-2 text-sm text-ink-2">
            So the app knows who you actually talk to. People you chat with come first, and each referral note matches how well you know them, picking up
            where you left off.
          </p>
          <LinkedInSteps tick="Messages" />
          <div className="mb-4">
            <RequestedNote storageKey="connect-chats-requested" what="chats" />
          </div>
          <ImportChats />
          <p className="mt-3 text-xs text-ink-3">
            Your chats are read in your browser. Only a summary per person is sent to the app: how many messages, when, and the last four lines, trimmed.
            Group chats are skipped. Loading a new file replaces the old one.
          </p>
        </section>
      )}

      <section id="gmail" className="card mb-8 scroll-mt-24 p-6">
        <Status done={gmailOn} text={gmailOn ? "Connected" : "Not connected yet"} />
        <h2 className="display mb-1 text-2xl">Gmail</h2>
        <p className="mt-2 mb-4 text-sm text-ink-2">
          Read only. JobPipe spots replies, interview invites and rejections from employers and moves the job on your tracker.
        </p>
        <GmailSync />
      </section>
    </div>
  );
}
