"use client";

// Once a day on the Jobs page: new jobs arrive every morning on their own, and the AI scores only the ones
// you pick. Scoring everything for everyone cost more than the app earns, so people choose what's worth a look.

import { useEffect, useState } from "react";

const SEEN_KEY = "scoreTipDay";
const OFF_KEY = "scoreTipOff";
const today = () => new Date().toISOString().slice(0, 10);

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the tip may show again, nothing worse.
  }
}

export function ScoreTipPopup({ unscored }: { unscored: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Read after the page loads, so the server render and the first browser render match.
    const show = unscored > 0 && read(OFF_KEY) !== "1" && read(SEEN_KEY) !== today();
    if (!show) return;
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, [unscored]);
  if (!open) return null;
  const close = (forever: boolean) => {
    write(SEEN_KEY, today());
    if (forever) write(OFF_KEY, "1");
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="score-tip-title">
      <div className="card w-full max-w-md p-6">
        <h2 id="score-tip-title" className="display text-2xl">
          Your new jobs are in
        </h2>
        <p className="mt-3 text-sm text-ink-2">
          We search for new jobs every morning. You have {unscored} {unscored === 1 ? "job" : "jobs"} without a score yet.
        </p>
        <p className="mt-3 text-sm text-ink-2">
          Tick the ones that look right for you, then press <strong>Score</strong>. The AI reads each job against your CV and tells you if
          it&apos;s worth applying.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => close(false)}>
            Got it
          </button>
          <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={() => close(true)}>
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
