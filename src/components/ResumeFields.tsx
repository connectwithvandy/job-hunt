"use client";

import { useAction, useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Resume } from "./ResumeDoc";
import { type ActionState, attempt, Feedback } from "./ui";

/**
 * Edit a tailored CV in plain fields: headline, summary, each role's bullets (one per line) and skills.
 * `edited` means JobPipe's own version is kept, so "Undo my edits" can bring it back.
 */
export function TailoredEditor({ jobId, resume, edited }: { jobId: Id<"jobs">; resume: Resume; edited?: boolean }) {
  const save = useMutation(api.jobs.saveTailoredResume);
  const restore = useMutation(api.jobs.restoreTailoredResume);
  const start = () => ({
    headline: resume.headline,
    summary: resume.summary,
    bullets: resume.experience.map((e) => e.bullets.join("\n")),
    skills: resume.skills.technical.join(", "),
  });
  const [headline, setHeadline] = useState(resume.headline);
  const [summary, setSummary] = useState(resume.summary);
  const [bullets, setBullets] = useState(resume.experience.map((e) => e.bullets.join("\n")));
  const [skills, setSkills] = useState(resume.skills.technical.join(", "));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const lines = (text: string, sep: RegExp) => text.split(sep).map((b) => b.trim()).filter(Boolean);
  const s0 = start();
  const changed = headline !== s0.headline || summary !== s0.summary || skills !== s0.skills || bullets.some((b, i) => b !== s0.bullets[i]);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label">Headline</span>
        <input className="field mt-1" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </label>
      <div className="block">
        <span className="label">Summary</span>
        <RewriteBox jobId={jobId} value={summary} onChange={setSummary} className="h-32" />
      </div>
      {resume.experience.map((e, i) => (
        <div key={e.id} className="block">
          <span className="label">
            {e.role}, {e.company}: one bullet per line
          </span>
          <RewriteBox jobId={jobId} value={bullets[i]} onChange={(text) => setBullets(bullets.map((b, j) => (j === i ? text : b)))} className="h-36" />
        </div>
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
        {changed && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              setHeadline(s0.headline);
              setSummary(s0.summary);
              setBullets(s0.bullets);
              setSkills(s0.skills);
              setState(null);
            }}
          >
            Cancel
          </button>
        )}
        {edited && !changed && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await attempt(async () => (await restore({ jobId }), "Back to the CV JobPipe wrote.")));
              setBusy(false);
            }}
          >
            Undo my edits
          </button>
        )}
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

/**
 * A text box with "Shorter" and "Plain words" for the line the cursor is on. The suggestion shows first;
 * nothing changes until you press "Use it". The check behind it never lets a rewrite add numbers, names or bigger claims.
 */
function RewriteBox({ jobId, value, onChange, className }: { jobId: Id<"jobs">; value: string; onChange: (text: string) => void; className: string }) {
  const rewrite = useAction(api.cvRewrite.rewriteLine);
  const box = useRef<HTMLTextAreaElement>(null);
  const [line, setLine] = useState<{ index: number; text: string } | null>(null);
  const [offer, setOffer] = useState<{ index: number; from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);

  // The line holding the cursor, so the buttons know what to rewrite.
  const pick = () => {
    const el = box.current;
    if (!el) return;
    const index = el.value.slice(0, el.selectionStart).split("\n").length - 1;
    const text = el.value.split("\n")[index]?.trim() ?? "";
    setLine(text ? { index, text } : null);
  };

  const run = async (mode: "shorter" | "plain") => {
    if (!line) return;
    setBusy(true);
    setOffer(null);
    setState(
      await attempt(async () => {
        const out = await rewrite({ jobId, text: line.text, mode });
        // A rewrite that tried to add facts isn't a failure: say why and keep the line.
        if ("problem" in out) return out.problem;
        setOffer({ index: line.index, from: line.text, to: out.text });
      }),
    );
    setBusy(false);
  };

  return (
    <div className="mt-1">
      <textarea ref={box} className={`field text-sm leading-relaxed ${className}`} value={value} onChange={(e) => onChange(e.target.value)} onSelect={pick} onClick={pick} onKeyUp={pick} />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-3">{line ? "Rewrite the line your cursor is on:" : "Click a line to rewrite it:"}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!line || busy} onClick={() => void run("shorter")}>
          Shorter
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!line || busy} onClick={() => void run("plain")}>
          Plain words
        </button>
        {busy && <span className="text-ink-3">Rewriting…</span>}
        <Feedback state={busy ? null : state} />
      </div>
      {offer && (
        <div className="mt-2 rounded-lg bg-soft p-3 text-sm">
          <p className="text-ink-3">Suggested, with no new facts:</p>
          <p className="mt-1">{offer.to}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const rows = value.split("\n");
                // Only swap the line if it still says what was rewritten.
                if (rows[offer.index]?.trim() === offer.from) rows[offer.index] = offer.to;
                onChange(rows.join("\n"));
                setOffer(null);
              }}
            >
              Use it
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOffer(null)}>
              Keep mine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Edit a master CV in plain fields: who you are, each role and its bullets, schools and skills. */
export function MasterEditor({ resumeId, resume }: { resumeId: Id<"resumes">; resume: Resume }) {
  const save = useMutation(api.users.saveResume);
  const [r, setR] = useState(resume);
  // Bullets, skills and links are edited as text, one per line or comma-separated, and split on save.
  const [bullets, setBullets] = useState(resume.experience.map((e) => e.bullets.join("\n")));
  const [technical, setTechnical] = useState(resume.skills.technical.join(", "));
  const [soft, setSoft] = useState(resume.skills.soft.join(", "));
  const [links, setLinks] = useState((resume.contact.links ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const lines = (text: string, sep: RegExp) => text.split(sep).map((b) => b.trim()).filter(Boolean);
  const setRole = (i: number, field: "role" | "company" | "start" | "end" | "location" | "domain", value: string) =>
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
        {text("Other links, separated by commas", links, setLinks)}
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
            {text("Location", e.location, (v) => setRole(i, "location", v))}
            {text("Website, for the logo (like adityabirla.com)", e.domain ?? "", (v) => setRole(i, "domain", v.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")))}
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
                  contact: { ...r.contact, links: lines(links, /,/) },
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
