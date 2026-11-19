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
    q: "Where do my jobs come from?",
    a: "Every morning JobPipe searches for your roles and adds new ones to Jobs. You can also search any time, or paste a job link, under Jobs → + Find or add jobs.",
  },
  {
    q: "What does the % on a job mean?",
    a: "How well the job fits your CV. A number with ~ and a dashed ring is a first guess from the title and words. Open the job and press Check the fit for the real score, which reads the whole job.",
  },
  {
    q: "Is the pay real?",
    a: "Pay the company listed shows as listed. When they didn't list it, you see a rough estimate from the job title and city, marked Estimated. Use it as a guide, not a promise.",
  },
  {
    q: "Does the CV it writes make things up?",
    a: "No. It reorders and rewords what's already in your CV to match the job. It never adds jobs, numbers or claims you didn't make. Read it before you send it.",
  },
  {
    q: "How do referrals work?",
    a: (
      <>
        Load your LinkedIn connections once (Profile → <Link href="/connect" className="underline">LinkedIn &amp; Gmail</Link>). Then Referrals shows who you know at each company, with a short note ready to send.
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
        Jobs, your tracker and some fit scores are free. More is in the Job Hunt Pass: see <Link href="/pricing" className="underline">pricing</Link> or Profile → Plan &amp; billing.
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
      <p className="mb-6 text-sm text-ink-2">Stuck, or something not working? Ask below and Vandana answers by email, usually the same day.</p>
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
