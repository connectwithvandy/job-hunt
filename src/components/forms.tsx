"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { parseConnectionsCsv } from "@/lib/connections";
import { errorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload";
import type { Resume } from "./ResumeDoc";
import { type ActionState, attempt, Feedback, Spinner } from "./ui";

const fileClass =
  "text-sm text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line";

export function ImportConnections() {
  const clear = useMutation(api.contacts.clearBatch);
  const importBatch = useMutation(api.contacts.importBatch);
  const [busy, setBusy] = useState("");
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = new FormData(e.currentTarget).get("file") as File | null;
        setState(
          await attempt(async () => {
            if (!file?.size) throw new Error("Choose your Connections.csv file.");
            const rows = parseConnectionsCsv(await file.text());
            setBusy("Replacing your old list…");
            while (await clear()) {
              // keep deleting until the old list is gone
            }
            for (let i = 0; i < rows.length; i += 400) {
              setBusy(`Loading ${Math.min(i + 400, rows.length).toLocaleString()} of ${rows.length.toLocaleString()}…`);
              await importBatch({ rows: rows.slice(i, i + 400) });
            }
            return `Loaded ${rows.length.toLocaleString()} connections.`;
          }),
        );
        setBusy("");
      }}
    >
      <input type="file" name="file" accept=".csv,text/csv" className={fileClass} />
      <button className="btn btn-primary" disabled={!!busy}>
        {busy && <Spinner />}
        {busy || "Load connections"}
      </button>
      <Feedback state={busy ? null : state} />
    </form>
  );
}

export function UploadResume({ replace }: { replace?: { _id: Id<"resumes">; label: string } }) {
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const setPhoto = useMutation(api.users.setPhoto);
  const readCv = useAction(api.agent.readCv);
  const [busy, setBusy] = useState("");
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const cv = form.get("cv") as File | null;
        const photo = form.get("photo") as File | null;
        setState(
          await attempt(async () => {
            if (!cv?.size && !photo?.size) throw new Error("Choose your CV file first.");
            if (photo?.size) {
              setBusy("Uploading your photo…");
              await setPhoto({ storageId: (await uploadFile(await generateUploadUrl(), photo)) as Id<"_storage"> });
            }
            if (!cv?.size) return "Photo updated.";
            setBusy("Reading your CV… about a minute");
            const label = String(form.get("label") ?? "").trim() || undefined;
            const { roles } = await readCv({ storageId: (await uploadFile(await generateUploadUrl(), cv)) as Id<"_storage">, fileName: cv.name, replaceId: replace?._id, label });
            return `Read your CV: ${roles} roles. Check it below and fix anything by hand.`;
          }),
        );
        setBusy("");
      }}
    >
      <h2 className="display mb-1 text-2xl">{replace ? `Replace "${replace.label}"` : "Add another CV"}</h2>
      <p className="mb-5 text-sm text-ink-2">
        PDF or Word. Claude reads it in, keeping every role, bullet and number.
        {replace ? " This replaces the CV below." : " Keep one per angle, like an SDR Leader CV and a GTM CV, and pick which track uses which."}
      </p>
      {!replace && (
        <label className="mb-4 block">
          <span className="label">Name it</span>
          <input name="label" className="field mt-1" placeholder="e.g. GTM Strategy CV" />
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">CV</span>
          <input type="file" name="cv" accept=".pdf,.docx,.txt,.md" className={`mt-2 block w-full ${fileClass}`} />
        </label>
        <label className="block">
          <span className="label">Photo (optional)</span>
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className={`mt-2 block w-full ${fileClass}`} />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={!!busy}>
          {busy && <Spinner />}
          {busy || "Upload"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

export function ResumeEditor({ resumeId, resume }: { resumeId: Id<"resumes">; resume: Resume }) {
  const save = useMutation(api.users.saveResume);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const json = String(new FormData(e.currentTarget).get("json"));
        setBusy(true);
        setState(
          await attempt(async () => {
            let parsed: Resume;
            try {
              parsed = JSON.parse(json) as Resume;
            } catch (err) {
              throw new Error(`That isn't valid JSON: ${errorMessage(err)}`);
            }
            await save({ resumeId, resume: parsed });
            return "CV saved.";
          }),
        );
        setBusy(false);
      }}
    >
      <textarea name="json" defaultValue={JSON.stringify(resume, null, 2)} spellCheck={false} className="field h-[70vh] font-mono text-xs leading-relaxed" />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save CV"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

type TrackInput = Pick<Doc<"tracks">, "key" | "name" | "color" | "status" | "titles" | "pitch" | "company" | "resumeId">;

export function TrackForm({ track, resumes }: { track: TrackInput; resumes: { _id: Id<"resumes">; label: string }[] }) {
  const save = useMutation(api.users.saveTrack);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card relative space-y-4 overflow-hidden p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setState(
          await attempt(async () => {
            await save({
              key: track.key,
              name: String(f.get("name")).trim(),
              color: String(f.get("color")),
              status: f.get("active") ? "active" : "paused",
              titles: String(f.get("titles")).split(/\n|,/).map((s) => s.trim()).filter(Boolean),
              pitch: String(f.get("pitch")).trim(),
              company: String(f.get("company") ?? "").trim() || undefined,
              resumeId: (String(f.get("resumeId") ?? "") || undefined) as Id<"resumes"> | undefined,
            });
            return "Saved.";
          }),
        );
        setBusy(false);
      }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: track.color }} />
      <div className="flex items-center gap-3">
        <input type="color" name="color" defaultValue={track.color} className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-card" aria-label="Track colour" />
        <input name="name" defaultValue={track.name} className="field display !text-xl" placeholder="Track name" />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">
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
      {resumes.length > 1 && (
        <label className="block">
          <span className="label">Start from this CV</span>
          <select name="resumeId" defaultValue={track.resumeId ?? ""} className="field mt-1">
            <option value="">Default CV</option>
            {resumes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
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

export function LocationForm({ location }: { location: string }) {
  const save = useMutation(api.users.setLocation);
  const [value, setValue] = useState(location);
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card flex flex-wrap items-end gap-3 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setState(await attempt(async () => (await save({ location: value }), "Saved.")));
      }}
    >
      <label className="block flex-1">
        <span className="label">Where you want to work</span>
        <input className="field mt-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="India" />
      </label>
      <button className="btn btn-primary btn-sm">Save</button>
      <Feedback state={state} />
    </form>
  );
}
