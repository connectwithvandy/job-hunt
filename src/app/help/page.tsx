"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { errorMessage } from "@/lib/errors";

/**
 * The founder's intro video (a YouTube link, unlisted is fine). Empty: the video box stays hidden.
 * Paste the link here once it's recorded, e.g. "https://www.youtube.com/watch?v=abc123".
 */
const INTRO_VIDEO = "";
const youTubeId = (url: string) => url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)?.[1];

/** Short answers, one question each, then a box to tell the owner anything else. */
const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "I'm new. What do I do first?",
    a: (
      <>
        Open <Link href="/" className="underline">Today</Link> and press the button in the &quot;Do this first&quot; box. It opens your best-fit job. Press Write my CV (about 2 minutes),
        read it, then press Apply. Apply on the company&apos;s site, come back, and say yes when JobPipe asks &quot;Did you apply?&quot;. It then reminds you when to follow up.
      </>
    ),
  },
  {
    q: "Where do my jobs come from?",
    a: "Every morning JobPipe searches for your roles and adds new ones to Jobs. You can also search any time, or paste a job link, under Jobs → + Find or add jobs.",
  },
  {
    q: "What does the % on a job mean?",
    a: "How well the job fits your CV. A number with ~ and a dashed ring is a first guess from the title and words. Open the job and press Check the fit for the real score, which reads the whole job.",
  },
  {
    q: "Is the pay real?",
    a: "Yes. We only show pay when the job posting lists it. When the company didn't list pay, we show nothing rather than guess.",
  },
  {
    q: "Does the CV it writes make things up?",
    a: "No. It reorders and rewords what's already in your CV to match the job. It never adds jobs, numbers or claims you didn't make. Read it before you send it.",
  },
  {
    q: "How do referrals work?",
    a: (
      <>
        Every job has a Referral, HR &amp; calls tab with buttons that search LinkedIn for your connections at that company. When JobPipe knows who you know there, it
        writes a short note to send and tracks every ask and follow-up. You can load your LinkedIn connections once (Profile →{" "}
        <Link href="/connect" className="underline">LinkedIn &amp; Gmail</Link>), but LinkedIn&apos;s download has stopped saying where people work, so for now the search
        buttons are the surer way to see who you know at a company.
      </>
    ),
  },
  {
    q: "Why connect Gmail?",
    a: "So recruiter replies and interview invites show up in Messages and move your applications along by themselves. JobPipe keeps only the emails about your job applications.",
  },
  {
    q: "What does it cost?",
    a: (
      <>
        Your first 7 days have every feature. After that, jobs, your tracker, 3 fit scores a day and 1 tailored CV stay free. The 1-month and 3-month plans add the rest: see{" "}
        <Link href="/pricing" className="underline">pricing</Link> or Profile → <Link href="/billing" className="underline">Plan &amp; billing</Link>.
      </>
    ),
  },
];

export default function Help() {
  const send = useMutation(api.feedback.send);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Help &amp; support</h1>
      <p className="mb-6 text-sm text-ink-2">Stuck, or something not working? Ask below and Vandana answers you by email.</p>
      {youTubeId(INTRO_VIDEO) && (
        <div className="card mb-6 overflow-hidden">
          <div className="aspect-video">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${youTubeId(INTRO_VIDEO)}`}
              title="How to get the most out of JobPipe"
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p className="p-4 text-sm font-medium">New here? Start with this short walkthrough.</p>
        </div>
      )}
      <div className="card divide-y divide-line">
        {QUESTIONS.map(({ q, a }) => (
          <details key={q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
              {q}
              <span className="text-ink-3 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm text-ink-2">{a}</p>
          </details>
        ))}
      </div>

      <section className="card mt-6 space-y-3 p-5">
        <h2 className="font-medium">Ask a question or tell us what&apos;s broken</h2>
        {state === "sent" ? (
          <p className="text-sm text-ink-2">Thanks, that&apos;s sent. You&apos;ll get an answer by email.</p>
        ) : (
          <>
            <textarea className="field h-28 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell it like you'd tell a friend." />
            {error && <p className="text-sm text-bad">{error}</p>}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={state === "sending" || !text.trim()}
              onClick={async () => {
                setState("sending");
                setError("");
                try {
                  await send({ text, page: "/help" });
                  setState("sent");
                } catch (err) {
                  setError(errorMessage(err));
                  setState("idle");
                }
              }}
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </>
        )}
        <p className="text-xs text-ink-3">
          Or write to <a href="mailto:hello@jobpipe.in" className="underline">hello@jobpipe.in</a>.
        </p>
      </section>
    </div>
  );
}
