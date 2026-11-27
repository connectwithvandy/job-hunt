"use client";

// Walks someone through using JobPipe: a checklist on Today with the next step open, and a pop-up the first time
// each step comes up. Steps tick themselves off from what the person has done (convex/lib/guide.ts).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
        <li>In LinkedIn&apos;s email, click Download archive. The file is called something like Basic_LinkedInDataExport_….zip. Don&apos;t unzip it.</li>
        <li>Choose that file below, then press Load connections.</li>
      </ol>
      {requested ? (
        <p className="text-ink-3">Requested it? LinkedIn&apos;s email can take up to an hour; check spam after that. Skipped it? Come back to this any time.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRequested}>
            I&apos;ve requested it
          </button>
          {/* Same as requested: the guide moves on to scoring and tailoring, and this step stays open to come back to. */}
          <button type="button" className="text-sm text-ink-3 underline hover:text-ink" onClick={onRequested}>
            Skip for now
          </button>
        </div>
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

/** hold: another pop-up is showing (where to work), so the guide's pop-up waits for the next visit. */
export function SetupGuide({ progress, bestJob, foundNote, hold }: { progress: GuideProgress; bestJob?: string; foundNote: string; hold?: boolean }) {
  const [requested, setRequested] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [popup, setPopup] = useState(false);
  const heldThisVisit = useRef(false);
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
    // Once another pop-up has shown this visit, the guide's waits for the next visit: never two in a row.
    if (hold) heldThisVisit.current = true;
    if (heldThisVisit.current || !nextKey || remembered(`guide-seen-${nextKey}`)) return;
    const t = setTimeout(() => setPopup(true), 1500);
    return () => clearTimeout(t);
  }, [nextKey, hold]);

  if (!next) return null;
  const closePopup = () => {
    remember(`guide-seen-${next.key}`);
    setPopup(false);
  };
  const open = picked ?? next.key;
  const doneCount = steps.filter((s) => s.done).length;

  // One step left: a single line that links to it, not an 800px card above the jobs (design round 1, 27 Nov).
  const almost = doneCount >= steps.length - 1 && !expanded;
  const stepHref = next.key === "connections" ? "/connect" : bestJob ? `/jobs/${bestJob}` : "/jobs";

  return (
    <>
      {!hidden && almost && (
        <p id="setup-guide" className="mb-6 flex flex-wrap items-center justify-between gap-x-3 text-[13px] text-ink-2 max-sm:mb-3">
          <span className="tnum min-w-0 leading-snug">
            {doneCount} of {steps.length} set up<span className="max-[479px]:hidden"> · </span>
            <Link href={stepHref} className="font-semibold text-ink underline underline-offset-2 max-[479px]:hidden">
              {next.title}
            </Link>
          </span>
          <span className="flex shrink-0 items-center gap-x-4 max-[479px]:-my-2">
            <button type="button" className="btn-text" onClick={() => setExpanded(true)}>
              All steps
            </button>
            <button type="button" className="btn-text" onClick={() => (remember("guide-hidden"), setHidden(true))}>
              Hide
            </button>
          </span>
          <Link href={stepHref} className="basis-full font-semibold text-ink underline underline-offset-2 min-[480px]:hidden">
            {next.title}
          </Link>
        </p>
      )}
      {!hidden && !almost && (
        <section id="setup-guide" className="card mb-8 scroll-mt-6 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Get JobPipe working for you</h2>
            <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => (remember("guide-hidden"), setHidden(true))}>
              Hide
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-3">
            {doneCount} of {steps.length} done
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-soft">
            <div className="h-full bg-ink transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          {/* Only the open step is a box; done and later steps are one line each (27 Nov walk: six boxes filled the
              first screen after setup and no job showed). */}
          {doneCount > 0 && (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
              {steps
                .filter((s) => s.done)
                .map((s) => (
                  <span key={s.key}>
                    <span className="text-good">✓</span> {s.title}
                  </span>
                ))}
            </p>
          )}
          {steps
            .filter((s) => !s.done && open === s.key)
            .map((s) => (
              <div key={s.key} className="mt-4 rounded-xl border border-line p-4">
                <div className="flex items-center gap-3 font-medium">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-soft text-xs text-ink">{steps.indexOf(s) + 1}</span>
                  {s.title}
                </div>
                <div className="pl-9">
                  <p className="mt-1 text-sm text-ink-2">{s.why}</p>
                  {s.key === "connections" ? (
                    <ConnectionsHelp requested={requested} onRequested={() => (remember("guide-connections-requested"), setRequested(true))} />
                  ) : (
                    <StepHelp step={s} jobs={progress.jobs} bestJob={bestJob} foundNote={foundNote} />
                  )}
                </div>
              </div>
            ))}
          {steps.some((s) => !s.done && s.key !== open) && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-3">
              Then:
              {steps
                .filter((s) => !s.done && s.key !== open)
                .map((s) => (
                  <button key={s.key} type="button" className="rounded-full border border-line px-3 py-1 hover:text-ink" onClick={() => setPicked(s.key)}>
                    {steps.indexOf(s) + 1}. {s.title}
                  </button>
                ))}
            </p>
          )}
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
