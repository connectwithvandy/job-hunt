"use client";

import { useMemo, useState } from "react";
import { diffCv, newNumbers, type CvLike, type Line } from "@/lib/cvDiff";

type Master = { _id: string; label: string; resume: CvLike };

const TAG: Record<Line["kind"], { label: string; cls: string }> = {
  same: { label: "Same", cls: "text-ink-3" },
  reworded: { label: "Reworded", cls: "text-accent" },
  new: { label: "New", cls: "text-warn" },
};

/**
 * "What changed": every line of the tailored CV marked Same, Reworded (with what it was) or New, plus the master lines
 * left out, so a person can check nothing was made up before sending it. Compared with the master CV the job's role
 * pitches from; the pack doesn't record which master it came from, so the person can switch.
 */
export function CvChanges({ tailored, masters, defaultMasterId }: { tailored: CvLike; masters: Master[]; defaultMasterId?: string | null }) {
  const [pick, setPick] = useState(defaultMasterId ?? masters[0]?._id);
  const master = masters.find((m) => m._id === pick) ?? masters[0];
  const d = useMemo(() => (master ? diffCv(tailored, master.resume) : null), [tailored, master]);
  if (!master || !d) return <p className="text-sm text-ink-2">Add a master CV first to compare.</p>;

  const row = (l: Line, key: string) => {
    const nums = l.kind === "same" ? [] : newNumbers(l.text, master.resume);
    return (
      <li key={key} className="grid gap-1 py-2 sm:grid-cols-[6rem_1fr] sm:gap-3">
        <span className={`text-xs font-semibold ${TAG[l.kind].cls}`}>{TAG[l.kind].label}</span>
        <span className="min-w-0">
          <span className={l.kind === "new" ? "rounded bg-warn/10 px-1" : l.kind === "reworded" ? "rounded bg-accent/15 px-1" : "text-ink-2"}>{l.text}</span>
          {l.kind === "reworded" && l.was && <span className="mt-0.5 block text-xs text-ink-3">Was: {l.was}</span>}
          {nums.length > 0 && <span className="mt-0.5 block text-xs text-warn">Not in your master CV: {nums.join(", ")}. Check before sending.</span>}
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink-2">
          {d.counts.same} same · {d.counts.reworded} reworded · <span className={d.counts.new ? "text-warn" : ""}>{d.counts.new} new</span> · {d.counts.leftOut} left out
        </p>
        {masters.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-ink-3">
            Compared with
            <select className="field w-auto py-1 text-xs" value={master._id} onChange={(e) => setPick(e.target.value)}>
              {masters.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-ink-3">New lines have no close match in your master CV. Read each one: keep it only if it&apos;s true.</p>
      <div>
        <div className="label mb-1">Headline and summary</div>
        <ul className="divide-y divide-line">
          {row(d.headline, "h")}
          {row(d.summary, "s")}
        </ul>
      </div>
      {d.roles.map((r, i) => (
        <div key={`${r.company}${i}`}>
          <div className="label mb-1">
            {r.company} · {r.role}
            {r.newRole && <span className="ml-2 text-warn">not in this master CV</span>}
          </div>
          <ul className="divide-y divide-line">{r.lines.map((l, j) => row(l, `${i}-${j}`))}</ul>
          {r.leftOut.length > 0 && (
            <details className="mt-1 text-xs text-ink-3">
              <summary className="cursor-pointer">{r.leftOut.length} left out for this job</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {r.leftOut.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
