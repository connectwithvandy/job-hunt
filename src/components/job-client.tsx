"use client";

import { useActionState, useState, useTransition } from "react";
import {
  type ActionState, addJob, draftNotes, findJobs, saveCoverLetter, setJobStatus, setOutreach,
} from "@/app/actions";
import { STATUS_LABELS } from "@/lib/defaults";
import type { Contact, JobStatus, Outreach, OutreachStatus, Track } from "@/lib/types";
import { CopyAndOpen, CopyButton, Feedback, Spinner } from "./ui";

export function StatusSelect({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [busy, start] = useTransition();
  return (
    <select
      className="field !w-auto !py-1.5 text-sm"
      value={status}
      disabled={busy}
      onChange={(e) => start(async () => void (await setJobStatus(jobId, e.target.value as JobStatus)))}
    >
      {Object.entries(STATUS_LABELS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

export function FindJobs({ tracks }: { tracks: Track[] }) {
  const active = tracks.filter((t) => t.status === "active");
  const [trackId, setTrackId] = useState(active[0]?.id ?? "");
  const [location, setLocation] = useState("India");
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="card p-5">
      <div className="label mb-3">Find jobs on Dreamwork</div>
      <div className="flex flex-wrap gap-2">
        <select className="field !w-auto" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          {active.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input className="field !w-36" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="India" aria-label="Location" />
        <button className="btn btn-primary" disabled={busy || !trackId} onClick={() => start(async () => setState(await findJobs(trackId, location)))}>
          {busy && <Spinner />}
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">Searches every title on the track, posted in the last 30 days. Remote roles open to that country are included.</p>
      <div className="mt-1">
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

export function AddJob() {
  const [state, action, busy] = useActionState(addJob, null);
  const [mode, setMode] = useState<"link" | "text">("link");
  return (
    <form action={action} className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="label">Add a job you found</span>
        <button type="button" className="text-xs text-ink-3 underline" onClick={() => setMode(mode === "link" ? "text" : "link")}>
          {mode === "link" ? "Paste the description instead" : "Use a link instead"}
        </button>
      </div>
      {mode === "link" ? (
        <input name="link" className="field" placeholder="LinkedIn, Dreamwork or careers page link" />
      ) : (
        <textarea name="text" className="field h-28" placeholder="Paste the whole job post here" />
      )}
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Reading the job…" : "Add job"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

export function CoverLetter({ jobId, text }: { jobId: string; text: string }) {
  const [value, setValue] = useState(text);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div>
      <textarea className="field h-64 leading-relaxed" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <CopyButton text={value} label="Copy cover letter" />
        {value !== text && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => start(async () => setState(await saveCoverLetter(jobId, value)))}>
            {busy ? "Saving…" : "Save edits"}
          </button>
        )}
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

export function PeoplePicker({ jobId, people, best }: { jobId: string; people: Contact[]; best: number }) {
  const [picked, setPicked] = useState<string[]>(people.slice(0, best).map((p) => p.id));
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div>
      <ul className="divide-y divide-line">
        {people.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#c6ff3d]"
              checked={picked.includes(p.id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))}
              aria-label={`Ask ${p.firstName}`}
            />
            <div className="min-w-0 flex-1">
              <a href={p.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {p.firstName} {p.lastName}
              </a>
              <div className="truncate text-xs text-ink-2">{p.position}</div>
            </div>
            {i < best && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">Best to ask</span>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary btn-sm" disabled={busy || !picked.length} onClick={() => start(async () => setState(await draftNotes(jobId, picked)))}>
          {busy && <Spinner />}
          {busy ? "Writing notes…" : `Draft ${picked.length} referral ${picked.length === 1 ? "note" : "notes"}`}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

const OUTREACH_FLOW: { status: OutreachStatus; label: string }[] = [
  { status: "sent", label: "Sent" },
  { status: "replied", label: "Replied" },
  { status: "referred", label: "Referred me" },
];

export function OutreachCard({ jobId, o, cvName }: { jobId: string; o: Outreach; cvName: string }) {
  const [message, setMessage] = useState(o.message);
  const [busy, start] = useTransition();
  const set = (status: OutreachStatus) => start(async () => void (await setOutreach(jobId, o.contactId, status, message)));
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{o.name}</div>
          <div className="text-xs text-ink-2">{o.position}</div>
        </div>
        <span className="text-xs text-ink-3">{o.status === "draft" ? "Not sent yet" : o.status === "referred" ? "Referred you" : o.status === "replied" ? "Replied" : `Sent${o.sentAt ? " " + new Date(o.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}`}</span>
      </div>
      <textarea className="field h-36 text-sm leading-relaxed" value={message} onChange={(e) => setMessage(e.target.value)} />
      <p className="mt-1 text-xs text-ink-3">Attach {cvName} in LinkedIn before you send.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyAndOpen text={message} url={o.url} />
        {OUTREACH_FLOW.map((s) => (
          <button key={s.status} className={`btn btn-sm ${o.status === s.status ? "btn-primary" : "btn-ghost"}`} disabled={busy} onClick={() => set(s.status)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
