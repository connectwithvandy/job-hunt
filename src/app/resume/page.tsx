"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageHead } from "@/components/bits";
import { AnswersForm, AutofillLink, ResumeEditor, UploadResume } from "@/components/forms";
import { MasterEditor } from "@/components/ResumeFields";
import { Loading } from "@/components/Loading";
import { ResumeDoc } from "@/components/ResumeDoc";
import { downloadDocx } from "@/lib/docx";
import { attempt, PrintButton, type ActionState, Feedback } from "@/components/ui";

export default function Cvs() {
  const me = useQuery(api.users.me);
  const all = useQuery(api.users.resumes);
  const [picked, setPicked] = useState<Id<"resumes"> | "new" | null>(null);
  const setDefault = useMutation(api.users.setDefaultResume);
  const rename = useMutation(api.users.renameResume);
  const remove = useMutation(api.users.deleteResume);
  const findLogos = useAction(api.agent.findLogos);
  const [state, setState] = useState<ActionState>(null);
  if (!me || !all) return <Loading />;

  const current = picked === "new" ? null : (all.find((r) => r._id === picked) ?? all.find((r) => r._id === me.defaultResumeId) ?? all[0]);
  const usedBy = current ? me.tracks.filter((t) => (t.resumeId ?? me.defaultResumeId) === current._id).map((t) => t.name) : [];

  return (
    <div>
      <PageHead title="CVs" sub="Your master CVs. Each job gets a tailored copy that only reorders and trims one of these, so every real number belongs here.">
        {current && <PrintButton />}
        {current && (
          <button className="btn btn-ghost btn-sm" onClick={() => void downloadDocx(current.resume, current.label)}>
            Download Word
          </button>
        )}
      </PageHead>

      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        {me.resumes.map((r) => (
          <button
            key={r._id}
            onClick={() => setPicked(r._id)}
            className={`rounded-full border px-3 py-1 text-sm ${current?._id === r._id ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}
          >
            {r.label}
            {r._id === me.defaultResumeId ? " · default" : ""}
          </button>
        ))}
        <button onClick={() => setPicked("new")} className={`rounded-full border border-dashed px-3 py-1 text-sm ${picked === "new" ? "border-accent text-accent" : "border-line text-ink-2 hover:text-ink"}`}>
          + Add a CV
        </button>
      </div>

      {picked === "new" || !current ? (
        <div className="no-print max-w-3xl">
          <UploadResume onAdded={setPicked} />
        </div>
      ) : (
        <>
          <div className="no-print card mb-6 flex max-w-4xl flex-wrap items-center gap-3 p-4 text-sm">
            <span className="text-ink-2">{usedBy.length ? `Used by: ${usedBy.join(", ")}` : "No role uses this CV yet. Pick it on the Roles page."}</span>
            <span className="flex-1" />
            {current.resume.experience.some((e) => !e.domain) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => setState(await attempt(async () => `Found ${(await findLogos({})).found} logos across your CVs.`))}
              >
                Add company logos
              </button>
            )}
            {current._id !== me.defaultResumeId && (
              <button className="btn btn-ghost btn-sm" onClick={async () => setState(await attempt(async () => (await setDefault({ resumeId: current._id }), "Now your default CV.")))}>
                Make default
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                const label = window.prompt("Name this CV", current.label);
                if (label) setState(await attempt(async () => (await rename({ resumeId: current._id, label }), "Renamed.")));
              }}
            >
              Rename
            </button>
            {me.resumes.length > 1 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  if (!window.confirm(`Delete the CV "${current.label}"? Roles using it will switch to your default CV.`)) return;
                  setState(await attempt(async () => (await remove({ resumeId: current._id }), "Deleted.")));
                  setPicked(null);
                }}
              >
                Delete
              </button>
            )}
            <Feedback state={state} />
          </div>
          <div className="overflow-x-auto pb-4">
            <ResumeDoc r={current.resume} photoUrl={me.photoUrl} />
          </div>
          <div className="no-print mt-8 grid max-w-4xl gap-6">
            <UploadResume replace={current} />
            <AnswersForm answers={me.answers} location={me.location} />
            {me.answers.length > 0 && <AutofillLink answers={me.answers} />}
            <details className="card p-6">
              <summary className="cursor-pointer font-medium">Fix something by hand</summary>
              <p className="mt-2 mb-4 text-sm text-ink-2">Change any line of this CV, then save. Tailored CVs for new jobs use the saved version.</p>
              <MasterEditor key={current._id + JSON.stringify(current.resume).length} resumeId={current._id} resume={current.resume} />
              <details className="mt-6">
                <summary className="cursor-pointer text-xs text-ink-3">Advanced: edit as raw data</summary>
                <div className="mt-3">
                  <ResumeEditor key={current._id + JSON.stringify(current.resume).length} resumeId={current._id} resume={current.resume} />
                </div>
              </details>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
