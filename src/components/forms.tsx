"use client";

import { useActionState } from "react";
import { importConnections, saveResumeJson, saveTrack } from "@/app/actions";
import type { Track } from "@/lib/types";
import { Feedback, Spinner } from "./ui";

export function ImportConnections() {
  const [state, action, busy] = useActionState(importConnections, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="file" name="file" accept=".csv,text/csv" className="text-sm file:mr-3 file:rounded-full file:border file:border-line file:bg-card file:px-3 file:py-1.5 file:text-sm" />
      <button className="btn btn-primary" disabled={busy}>
        {busy && <Spinner />}
        {busy ? "Loading…" : "Load connections"}
      </button>
      <Feedback state={busy ? null : state} />
    </form>
  );
}

export function ResumeEditor({ json }: { json: string }) {
  const [state, action, busy] = useActionState(saveResumeJson, null);
  return (
    <form action={action}>
      <textarea name="json" defaultValue={json} spellCheck={false} className="field h-[70vh] font-mono text-xs leading-relaxed" />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save CV"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

export function TrackForm({ track }: { track: Track }) {
  const [state, action, busy] = useActionState(saveTrack, null);
  return (
    <form action={action} className="card relative space-y-4 overflow-hidden p-6">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: track.color }} />
      <input type="hidden" name="id" value={track.id} />
      <div className="flex items-center gap-3">
        <input type="color" name="color" defaultValue={track.color} className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-card" aria-label="Track colour" />
        <input name="name" defaultValue={track.name} className="field display !text-xl" placeholder="Track name" />
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" name="active" defaultChecked={track.status === "active"} className="h-4 w-4" />
          Active
        </label>
      </div>
      <label className="block">
        <span className="label">Titles to search, one per line</span>
        <textarea name="titles" defaultValue={track.titles.join("\n")} className="field mt-1 h-28" />
      </label>
      <label className="block">
        <span className="label">Your pitch for this track</span>
        <input name="pitch" defaultValue={track.pitch} className="field mt-1" placeholder="How you want to come across" />
      </label>
      <label className="block">
        <span className="label">Only this company (for an internal move)</span>
        <input name="company" defaultValue={track.company ?? ""} className="field mt-1" placeholder="Leave empty to search everywhere" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}
