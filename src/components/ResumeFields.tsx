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

/** Edit a master CV in plain fields: who you are, each role and its bullets, schools and skills. */
export function MasterEditor({ resumeId, resume }: { resumeId: Id<"resumes">; resume: Resume }) {
  const save = useMutation(api.users.saveResume);
  const [r, setR] = useState(resume);
  // Bullets and skills are edited as text, one per line or comma-separated, and split on save.
  const [bullets, setBullets] = useState(resume.experience.map((e) => e.bullets.join("\n")));
  const [technical, setTechnical] = useState(resume.skills.technical.join(", "));
  const [soft, setSoft] = useState(resume.skills.soft.join(", "));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const lines = (text: string, sep: RegExp) => text.split(sep).map((b) => b.trim()).filter(Boolean);
  const setRole = (i: number, field: "role" | "company" | "start" | "end" | "location", value: string) =>
    setR({ ...r, experience: r.experience.map((e, j) => (j === i ? { ...e, [field]: value } : e)) });
  const setSchool = (i: number, field: "school" | "degree" | "year", value: string) =>
    setR({ ...r, education: r.education.map((e, j) => (j === i ? { ...e, [field]: value } : e)) });
  const text = (label: string, value: string, onChange: (v: string) => void, wide = false) => (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      <input className="field mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {text("Name", r.name, (name) => setR({ ...r, name }))}
        {text("Headline", r.headline, (headline) => setR({ ...r, headline }))}
        {text("Email", r.contact.email, (email) => setR({ ...r, contact: { ...r.contact, email } }))}
        {text("Phone", r.contact.phone, (phone) => setR({ ...r, contact: { ...r.contact, phone } }))}
        {text("Location", r.contact.location, (location) => setR({ ...r, contact: { ...r.contact, location } }))}
        {text("LinkedIn", r.contact.linkedin, (linkedin) => setR({ ...r, contact: { ...r.contact, linkedin } }))}
      </div>
      <label className="block">
        <span className="label">Summary</span>
        <textarea className="field mt-1 h-32 text-sm leading-relaxed" value={r.summary} onChange={(e) => setR({ ...r, summary: e.target.value })} />
      </label>
      {r.experience.map((e, i) => (
        <fieldset key={e.id} className="rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-medium">
            {e.role || "Role"}, {e.company || "company"}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {text("Title", e.role, (v) => setRole(i, "role", v))}
            {text("Company", e.company, (v) => setRole(i, "company", v))}
            {text("From", e.start, (v) => setRole(i, "start", v))}
            {text("To", e.end, (v) => setRole(i, "end", v))}
            {text("Location", e.location, (v) => setRole(i, "location", v), true)}
          </div>
          <label className="mt-3 block">
            <span className="label">Bullets, one per line</span>
            <textarea
              className="field mt-1 h-36 text-sm leading-relaxed"
              value={bullets[i]}
              onChange={(ev) => setBullets(bullets.map((b, j) => (j === i ? ev.target.value : b)))}
            />
          </label>
        </fieldset>
      ))}
      {r.education.map((e, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-3">
          {text("School", e.school, (v) => setSchool(i, "school", v))}
          {text("Degree", e.degree, (v) => setSchool(i, "degree", v))}
          {text("Year", e.year, (v) => setSchool(i, "year", v))}
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("Skills, separated by commas", technical, setTechnical)}
        {text("Soft skills, separated by commas", soft, setSoft)}
      </div>
      <div className="flex items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setState(
              await attempt(async () => {
                const next: Resume = {
                  ...r,
                  experience: r.experience.map((e, i) => ({ ...e, bullets: lines(bullets[i], /\n/) })),
                  skills: { technical: lines(technical, /,/), soft: lines(soft, /,/) },
                };
                await save({ resumeId, resume: next });
                return "CV saved.";
              }),
            );
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save CV"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}
