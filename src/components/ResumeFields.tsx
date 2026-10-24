"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Resume } from "./ResumeDoc";
import { type ActionState, attempt, Feedback } from "./ui";

/** Edit a tailored CV in plain fields: headline, summary, each role's bullets (one per line) and skills. */
export function TailoredEditor({ jobId, resume }: { jobId: Id<"jobs">; resume: Resume }) {
  const save = useMutation(api.jobs.saveTailoredResume);
  const [headline, setHeadline] = useState(resume.headline);
  const [summary, setSummary] = useState(resume.summary);
  const [bullets, setBullets] = useState(resume.experience.map((e) => e.bullets.join("\n")));
  const [skills, setSkills] = useState(resume.skills.technical.join(", "));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const lines = (text: string, sep: RegExp) => text.split(sep).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label">Headline</span>
        <input className="field mt-1" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Summary</span>
        <textarea className="field mt-1 h-32 text-sm leading-relaxed" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      {resume.experience.map((e, i) => (
        <label key={e.id} className="block">
          <span className="label">
            {e.role}, {e.company}: one bullet per line
          </span>
          <textarea
            className="field mt-1 h-36 text-sm leading-relaxed"
            value={bullets[i]}
            onChange={(ev) => setBullets(bullets.map((b, j) => (j === i ? ev.target.value : b)))}
          />
        </label>
      ))}
      <label className="block">
        <span className="label">Skills, separated by commas</span>
        <input className="field mt-1" value={skills} onChange={(e) => setSkills(e.target.value)} />
      </label>
      <div className="flex items-center gap-3">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setState(
              await attempt(async () => {
                const next: Resume = {
                  ...resume,
                  headline: headline.trim(),
                  summary: summary.trim(),
                  experience: resume.experience.map((e, i) => ({ ...e, bullets: lines(bullets[i], /\n/) })),
                  skills: { ...resume.skills, technical: lines(skills, /,/) },
                };
                const unverified = await save({ jobId, resume: next });
                return unverified.length ? `Saved. Check these numbers, they aren't in any of your CVs: ${unverified.join(", ")}` : "Saved. Every number matches your CVs.";
              }),
            );
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}
