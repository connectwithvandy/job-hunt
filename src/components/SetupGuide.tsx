"use client";

// Walks someone through using JobPipe: a checklist on Today with the next step open, and a pop-up the first time
// each step comes up. Steps tick themselves off from what the person has done (convex/lib/guide.ts).

import Link from "next/link";
import { useEffect, useState } from "react";
import { guideSteps, nextGuideStep, type GuideProgress, type GuideStep } from "../../convex/lib/guide";
import { ImportConnections } from "@/components/forms";

const LINKEDIN_EXPORT = "https://www.linkedin.com/mypreferences/d/download-my-data";

// Browser storage can be blocked; the guide still works, it just asks again.
function remembered(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function remember(key: string, on = true) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {}
}

function ConnectionsHelp({ requested, onRequested }: { requested: boolean; onRequested: () => void }) {
  return (
    <div className="mt-3 space-y-3 text-sm text-ink-2">
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Open{" "}
          <a className="underline" href={LINKEDIN_EXPORT} target="_blank" rel="noreferrer">
            LinkedIn&apos;s &quot;Get a copy of your data&quot; page
          </a>
          . Sign in if it asks.
        </li>
        <li>Choose &quot;Want something in particular?&quot;, tick only Connections, and press Request archive.</li>
        <li>LinkedIn emails you a link, usually in 10 to 30 minutes. You can carry on here meanwhile.</li>
        <li>Open the email, download the zip file and unzip it. Double-clicking it usually does this.</li>
        <li>Choose the file called Connections.csv below, then press Load connections.</li>
      </ol>
      {requested ? (
        <p className="text-ink-3">Waiting for LinkedIn&apos;s email. Check spam if it takes over an hour.</p>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRequested}>
          I&apos;ve requested it
        </button>
      )}
      <ImportConnections />
      <p className="text-xs text-ink-3">Only names, companies, titles and profile links are kept, visible to you alone. Nothing is ever sent on LinkedIn for you.</p>
    </div>
  );
}

function StepHelp({ step, jobs, bestJob, foundNote }: { step: GuideStep; jobs: number; bestJob?: string; foundNote: string }) {
  if (step.key === "score") {
    return (
      <div className="mt-3 text-sm text-ink-2">
        {jobs ? (
          <>
            <p>Open Jobs and press Score. New jobs also get scored every morning.</p>
            <Link href="/jobs" className="btn btn-primary btn-sm mt-3">
              Go to Jobs
            </Link>
          </>
        ) : (
          <p>{foundNote}</p>
        )}
      </div>
    );
  }
  if (step.key === "tailor" || step.key === "apply") {
    return (
      <div className="mt-3 text-sm text-ink-2">
        <p>{step.key === "tailor" ? "Open your best-fit job and ask for the tailored CV. You can read and change it before using it." : "Apply on the company's own site, then come back and mark the job as applied."}</p>
        <Link href={bestJob ? `/jobs/${bestJob}` : "/jobs"} className="btn btn-primary btn-sm mt-3">
          {bestJob ? "Open your best job" : "Go to Jobs"}
        </Link>
      </div>
    );
  }
  return (
    <Link href={step.key === "cv" ? "/resume" : "/tracks"} className="btn btn-primary btn-sm mt-3">
      Do this now
    </Link>
  );
}

export function SetupGuide({ progress, bestJob, foundNote }: { progress: GuideProgress; bestJob?: string; foundNote: string }) {
  const [requested, setRequested] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [popup, setPopup] = useState(false);
  const [picked, setPicked] = useState<GuideStep["key"]>();
  const steps = guideSteps(progress);
  const next = nextGuideStep(steps, requested);
  const nextKey = next?.key;

  useEffect(() => {
    // Read after the first paint: the server has no browser storage.
    const t = setTimeout(() => {
      setRequested(remembered("guide-connections-requested"));
      setHidden(remembered("guide-hidden"));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // The pop-up shows once per step, a moment after the page opens.
  useEffect(() => {
    if (!nextKey || remembered(`guide-seen-${nextKey}`)) return;
    const t = setTimeout(() => setPopup(true), 1500);
    return () => clearTimeout(t);
  }, [nextKey]);

  if (!next) return null;
  const closePopup = () => {
    remember(`guide-seen-${next.key}`);
    setPopup(false);
  };
  const open = picked ?? next.key;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      {!hidden && (
        <section id="setup-guide" className="card mb-8 scroll-mt-6 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="display text-2xl">Get JobPipe working for you</h2>
            <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => (remember("guide-hidden"), setHidden(true))}>
              Hide
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-3">
            {doneCount} of {steps.length} done
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-soft">
            <div className="h-full bg-accent transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-5 space-y-2">
            {steps.map((s, i) => (
              <li key={s.key} className={`rounded-xl border border-line p-4 ${s.done ? "opacity-60" : ""}`}>
                <button type="button" className="flex w-full items-center gap-3 text-left font-medium" disabled={s.done} onClick={() => setPicked(s.key)}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${s.done ? "bg-accent text-on-accent" : "bg-soft text-ink"}`}>{s.done ? "✓" : i + 1}</span>
                  {s.title}
                </button>
                {!s.done && open === s.key && (
                  <div className="pl-9">
                    <p className="mt-1 text-sm text-ink-2">{s.why}</p>
                    {s.key === "connections" ? (
                      <ConnectionsHelp requested={requested} onRequested={() => (remember("guide-connections-requested"), setRequested(true))} />
                    ) : (
                      <StepHelp step={s} jobs={progress.jobs} bestJob={bestJob} foundNote={foundNote} />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {hidden && (
        <button type="button" className="mb-6 text-sm text-ink-3 underline hover:text-ink" onClick={() => (remember("guide-hidden", false), setHidden(false))}>
          Show setup guide ({doneCount} of {steps.length} done)
        </button>
      )}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="guide-popup-title">
          <div className="card w-full max-w-md p-6">
            <p className="text-sm text-ink-3">Here&apos;s what to do now</p>
            <h2 id="guide-popup-title" className="display mt-1 text-2xl">
              {next.title}
            </h2>
            <p className="mt-2 text-sm text-ink-2">{next.why}</p>
            <div className="mt-5 flex items-center gap-4">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  closePopup();
                  setHidden(false);
                  setPicked(next.key);
                  setTimeout(() => document.getElementById("setup-guide")?.scrollIntoView({ behavior: "smooth" }), 50);
                }}
              >
                Show me how
              </button>
              <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={closePopup}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
