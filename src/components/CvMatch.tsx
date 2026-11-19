"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cvMatch, type CvLike } from "../../convex/lib/cvMatch";

/**
 * How many of the posting's sales terms your CV uses, worked out in the browser for free (no AI).
 * Shows the tailored CV once there is one, and your CV as it is before that.
 */
export function CvMatch({
  description,
  company,
  tailored,
  resumeId,
}: {
  description?: string;
  company: string;
  /** The tailored CV for this job, when it's written. */
  tailored?: CvLike;
  /** The CV this job is tailored from: the role's CV, else your default. */
  resumeId: Id<"resumes"> | null | undefined;
}) {
  const all = useQuery(api.users.resumes);
  const base = all?.find((r) => r._id === resumeId)?.resume ?? all?.[0]?.resume;
  const mine = useMemo(() => (description && base ? cvMatch(description, base, company) : null), [description, base, company]);
  const fitted = useMemo(() => (description && tailored ? cvMatch(description, tailored, company) : null), [description, tailored, company]);
  const m = fitted ?? mine;
  if (!description || !m) return null;

  // Shown as a count, not a %: a second percentage next to the Fit score read as a rival verdict
  // ("Fit 84%" beside "CV match 58%", 19 Nov walk). The fit score is the one to go by.
  const total = m.covered.length + m.missing.length;
  const before = mine && fitted ? mine.covered.length : null;
  const missing = m.missing.slice(0, 8);
  return (
    <div className="mt-4 rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">Keyword check</span>
        <span className="text-ink-2">
          {m.covered.length} of {total} key terms from the posting are in {fitted ? "your tailored CV" : "your CV"}
        </span>
        {before !== null && <span className="text-xs text-ink-3">{before} before tailoring</span>}
      </div>
      {missing.length > 0 ? (
        <>
          <p className="mt-1">
            <span className="text-ink-2">Missing:</span> {missing.map((t) => t.label).join(", ")}
          </p>
          <p className="text-xs text-ink-3">Add these only if they&apos;re true for you.</p>
        </>
      ) : (
        <p className="mt-1 text-good">Your CV uses every key term in the posting.</p>
      )}
      {m.covered.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink">Covered ({m.covered.length})</summary>
          <p className="mt-1 text-xs text-ink-2">{m.covered.map((t) => t.label).join(", ")}</p>
        </details>
      )}
      <p className="mt-1 text-xs text-ink-3">Counts the sales terms and repeated phrases in the posting that your CV also uses. A guide for wording; the Fit score is the one to go by.</p>
    </div>
  );
}
