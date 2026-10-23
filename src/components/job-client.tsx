"use client";

import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { STATUS_LABELS } from "../../convex/lib/defaults";
import { type ActionState, attempt, CopyAndOpen, CopyButton, Feedback, Spinner } from "./ui";

type JobStatus = Doc<"jobs">["status"];
type Outreach = Doc<"jobs">["outreach"][number];
type OutreachStatus = Outreach["status"];

export function StatusSelect({ jobId, status }: { jobId: Id<"jobs">; status: JobStatus }) {
  const setStatus = useMutation(api.jobs.setStatus);
  return (
    <select className="field !w-auto !py-1.5 text-sm" value={status} onChange={(e) => void setStatus({ jobId, status: e.target.value as JobStatus })}>
      {Object.entries(STATUS_LABELS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

export function FindJobs({ tracks }: { tracks: Doc<"tracks">[] }) {
  const findJobs = useAction(api.agent.findJobs);
  const active = tracks.filter((t) => t.status === "active");
  const [trackKey, setTrackKey] = useState(active[0]?.key ?? "");
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="card p-5">
      <div className="label mb-3">Find jobs on Dreamwork</div>
      <div className="flex flex-wrap gap-2">
        <select className="field !w-auto" value={trackKey} onChange={(e) => setTrackKey(e.target.value)}>
          {active.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          disabled={busy || !trackKey}
          onClick={() =>
            start(async () =>
              setState(
                await attempt(async () => {
                  const { added, trackName } = await findJobs({ trackKey });
                  return added ? `Found ${added} new ${added === 1 ? "job" : "jobs"} for ${trackName}. Score them to see which fit.` : "No new jobs since last time.";
                }),
              ),
            )
          }
        >
          {busy && <Spinner />}
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">Searches every title on the track, posted in the last 30 days, in the place you chose on the Tracks page.</p>
      <div className="mt-1">
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

export function AddJob() {
  const addJob = useAction(api.agent.addJob);
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "text">("link");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setState(
          await attempt(async () => {
            const id = await addJob({ link: String(form.get("link") ?? "") || undefined, text: String(form.get("text") ?? "") || undefined });
            router.push(`/jobs/${id}`);
          }),
        );
        setBusy(false);
      }}
    >
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

export function CoverLetter({ jobId, text }: { jobId: Id<"jobs">; text: string }) {
  const save = useMutation(api.jobs.saveCoverLetter);
  const [value, setValue] = useState(text);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div>
      <textarea className="field h-64 leading-relaxed" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <CopyButton text={value} label="Copy cover letter" />
        {value !== text && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => start(async () => setState(await attempt(async () => (await save({ jobId, text: value }), "Saved."))))}>
            {busy ? "Saving…" : "Save edits"}
          </button>
        )}
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

export function DirectNote({ text }: { text: string }) {
  const [value, setValue] = useState(text);
  return (
    <div>
      <textarea className="field h-32 text-sm leading-relaxed" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-2">
        <CopyButton text={value} label="Copy note" />
      </div>
    </div>
  );
}

export function PeoplePicker({ jobId, people, best }: { jobId: Id<"jobs">; people: Doc<"contacts">[]; best: number }) {
  const draft = useAction(api.agent.draftNotes);
  const [picked, setPicked] = useState<Id<"contacts">[]>(people.slice(0, best).map((p) => p._id));
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div>
      <ul className="divide-y divide-line">
        {people.map((p, i) => (
          <li key={p._id} className="flex items-center gap-3 py-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#c6ff3d]"
              checked={picked.includes(p._id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, p._id] : picked.filter((x) => x !== p._id))}
              aria-label={`Ask ${p.firstName}`}
            />
            <div className="min-w-0 flex-1">
              <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {p.firstName} {p.lastName}
              </a>
              <div className="truncate text-xs text-ink-2">{p.position}</div>
            </div>
            {i < best && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">Best to ask</span>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !picked.length}
          onClick={() =>
            start(async () =>
              setState(
                await attempt(async () => {
                  const { drafted } = await draft({ jobId, contactIds: picked });
                  return `Drafted ${drafted} ${drafted === 1 ? "note" : "notes"}.`;
                }),
              ),
            )
          }
        >
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

export function OutreachCard({ jobId, o, cvName }: { jobId: Id<"jobs">; o: Outreach; cvName: string }) {
  const setOutreach = useMutation(api.jobs.setOutreach);
  const [message, setMessage] = useState(o.message);
  const sentLabel = o.sentAt ? ` ${new Date(o.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "";
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{o.name}</div>
          <div className="text-xs text-ink-2">{o.position}</div>
        </div>
        <span className="text-xs text-ink-3">
          {o.status === "draft" ? "Not sent yet" : o.status === "referred" ? "Referred you" : o.status === "replied" ? "Replied" : `Sent${sentLabel}`}
        </span>
      </div>
      <textarea className="field h-36 text-sm leading-relaxed" value={message} onChange={(e) => setMessage(e.target.value)} />
      {cvName && <p className="mt-1 text-xs text-ink-3">Attach {cvName} in LinkedIn before you send.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyAndOpen text={message} url={o.url} />
        {OUTREACH_FLOW.map((s) => (
          <button
            key={s.status}
            className={`btn btn-sm ${o.status === s.status ? "btn-primary" : "btn-ghost"}`}
            onClick={() => void setOutreach({ jobId, contactId: o.contactId, status: s.status, message })}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
