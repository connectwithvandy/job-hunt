"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Loading } from "@/components/Loading";
import { attempt, Feedback, type ActionState } from "@/components/ui";
import type { Seniority } from "../../../convex/lib/jobPrefs";
import { ARCHIVE_CHOICES, archiveLabel } from "@/lib/archive";

const LEVELS: { value: Seniority; label: string }[] = [
  { value: "director", label: "Director and up" },
  { value: "manager", label: "Manager or lead" },
  { value: "senior", label: "Senior" },
  { value: "mid", label: "Mid-level" },
  { value: "junior", label: "Junior" },
];

/** Job preferences: a pay floor, the seniority you want, words you never want in a title and how old a posting can be. Jobs and Today leave out the rest. */
export default function Preferences() {
  const prefs = useQuery(api.users.jobPrefs);
  if (prefs === undefined) return <Loading />;
  if (prefs === null) return null;
  return <Form prefs={prefs} />;
}

function Form({ prefs }: { prefs: { minPayL: number | null; levels: Seniority[]; blockedWords: string[]; maxAgeDays: number; expected: string | null } }) {
  const save = useMutation(api.users.setJobPrefs);
  const [minPay, setMinPay] = useState(prefs.minPayL ? String(prefs.minPayL) : "");
  const [levels, setLevels] = useState<Seniority[]>(prefs.levels);
  const [words, setWords] = useState(prefs.blockedWords.join(", "));
  const [maxAge, setMaxAge] = useState(prefs.maxAgeDays);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  // Lime only once something changed, the same as About you (28 Nov review: Save looked different page to page).
  const dirty = minPay !== (prefs.minPayL ? String(prefs.minPayL) : "") || levels.join() !== prefs.levels.join() || words !== prefs.blockedWords.join(", ") || maxAge !== prefs.maxAgeDays;
  const toggle = (l: Seniority) => setLevels((now) => (now.includes(l) ? now.filter((x) => x !== l) : [...now, l]));
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Job preferences</h1>
      <p className="mb-6 text-sm text-ink-2">Jobs that don&apos;t match these are left out of Jobs and Today. Jobs you&apos;ve already started or applied to always stay.</p>
      <section className="card space-y-6 p-6">
        <label className="block">
          <span className="label">Lowest pay you&apos;d take</span>
          <span className="mt-1 flex items-center gap-2">
            <span className="text-sm text-ink-2">₹</span>
            <input className="field w-28" inputMode="decimal" value={minPay} onChange={(e) => setMinPay(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 25" />
            <span className="text-sm text-ink-2">lakhs a year</span>
          </span>
          <span className="mt-1 block text-xs text-ink-3">
            Hides a job only when the posting lists pay below this. Jobs that don&apos;t list pay always stay.
            {prefs.expected && ` Your expected CTC from setup: ${prefs.expected}.`}
          </span>
        </label>
        <div>
          <span className="label">Seniority you want</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {LEVELS.map((l) => {
              const on = levels.includes(l.value);
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => toggle(l.value)}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink font-medium text-paper" : "border-line bg-card text-ink-2 hover:text-ink"}`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
          <span className="mt-1 block text-xs text-ink-3">Pick none to see every level. Read from the job title, so it&apos;s a guide.</span>
        </div>
        <label className="block">
          <span className="label">Never show jobs with these words in the title</span>
          <input className="field mt-1" value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. Trainer, Franchise, Recruiter" />
          <span className="mt-1 block text-xs text-ink-3">Separate words with commas.</span>
        </label>
        <div>
          <span className="label">Archive postings older than</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {ARCHIVE_CHOICES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setMaxAge(d)}
                className={`rounded-full border px-3 py-1 text-sm ${maxAge === d ? "border-ink bg-ink font-medium text-paper" : "border-line bg-card text-ink-2 hover:text-ink"}`}
              >
                {archiveLabel(d)}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-ink-3">An old posting is often already filled. Archived jobs move to Jobs → Archived, and closed ones go there too.</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`btn btn-sm ${dirty ? "btn-primary" : "btn-secondary"}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const pay = minPay ? Number(minPay) : null;
              setState(
                await attempt(async () => {
                  await save({ minPayL: pay && Number.isFinite(pay) ? pay : null, levels, blockedWords: words.split(","), maxAgeDays: maxAge });
                  return "Saved. Jobs and Today now follow these.";
                }),
              );
              setBusy(false);
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <Feedback state={busy ? null : state} />
        </div>
      </section>
    </div>
  );
}
