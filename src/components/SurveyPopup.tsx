"use client";

// A small "how's it going" card in the corner, at the moments in convex/lib/survey.ts.
// It waits a little after the page opens so it never jumps in front of what someone came to do.

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { SURVEY_CHOICES } from "../../convex/lib/survey";
import { errorMessage } from "@/lib/errors";

const HOUR = 3_600_000;
const SHOW_AFTER_MS = 20_000;

const QUESTIONS = {
  found_jobs: { title: "Is JobPipe finding jobs worth applying to?", note: "What would make the jobs better? (optional)" },
  recommend: { title: "How likely are you to recommend JobPipe to a friend?", note: "What would make it worth paying for? (optional)" },
  interviews: { title: "Has JobPipe helped you get interviews yet?", note: "Anything that would help more? (optional)" },
} as const;

export function SurveyPopup() {
  // Rounded to the hour so the question doesn't re-ask the server every render.
  const [now] = useState(() => Math.floor(Date.now() / HOUR) * HOUR);
  const ask = useQuery(api.surveys.next, { now });
  const answer = useMutation(api.surveys.answer);
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<string>();
  const [score, setScore] = useState<number>();
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "thanks">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ask) return;
    const t = setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [ask]);

  if (state === "thanks") {
    return (
      <div className="card fixed right-4 bottom-4 z-40 w-[calc(100%-2rem)] max-w-sm p-5 print:hidden">
        <p className="font-medium">Thank you. I read every answer.</p>
        <p className="mt-1 text-sm text-ink-3">Vandy</p>
        <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => setState("idle")}>
          Close
        </button>
      </div>
    );
  }
  if (!ask || !ready) return null;

  const q = QUESTIONS[ask.kind];
  const picked = ask.kind === "recommend" ? score !== undefined : !!choice;
  const send = async (skipped: boolean) => {
    setState("sending");
    setError("");
    try {
      await answer({ kind: ask.kind, round: ask.round, skipped, choice, score, note: note.trim() || undefined });
      setState(skipped ? "idle" : "thanks");
      setChoice(undefined);
      setScore(undefined);
      setNote("");
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  };

  return (
    <div role="dialog" aria-label="Quick question" className="card fixed right-4 bottom-4 z-40 w-[calc(100%-2rem)] max-w-sm space-y-3 p-5 print:hidden">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{q.title}</p>
        <button type="button" aria-label="Close" className="text-ink-3 hover:text-ink" disabled={state === "sending"} onClick={() => send(true)}>
          ✕
        </button>
      </div>
      {ask.kind === "recommend" ? (
        <div>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                aria-pressed={score === n}
                className={`rounded border py-1.5 text-sm tabular-nums ${score === n ? "border-accent bg-accent text-white" : "border-line hover:border-ink-3"}`}
                onClick={() => setScore(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-3">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {SURVEY_CHOICES[ask.kind].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={choice === c}
              className={`rounded-full border px-3 py-1.5 text-sm ${choice === c ? "border-accent bg-accent text-white" : "border-line hover:border-ink-3"}`}
              onClick={() => setChoice(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {picked && <textarea className="field h-20 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={q.note} />}
      {error && <p className="text-sm text-bad">{error}</p>}
      <button type="button" className="btn btn-primary btn-sm" disabled={!picked || state === "sending"} onClick={() => send(false)}>
        {state === "sending" ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
