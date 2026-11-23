"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Loading } from "@/components/Loading";
import { CvLayoutPick, ResumeDoc, type Resume } from "@/components/ResumeDoc";
import { TailoredEditor } from "@/components/ResumeFields";
import { type ActionState, attempt, DownloadMenu, Feedback } from "@/components/ui";
import { CvChanges } from "@/components/CvChanges";
import { downloadDocx } from "@/lib/docx";
import { logoMap } from "@/lib/logos";
import { estimatePages, TWO_PAGES } from "../../../../../convex/lib/cvLength";

export default function TailoredResume() {
  const { id } = useParams<{ id: string }>();
  const me = useQuery(api.users.me);
  const all = useQuery(api.users.resumes);
  const data = useQuery(api.jobs.get, { jobId: id as Id<"jobs"> });
  // ?sent=1 shows the copy frozen when you applied, as the company read it.
  const params = useSearchParams();
  const sent = params.get("sent") ? data?.job.sent : undefined;
  // ?edit=1 (from the job page's "Edit this CV") opens the editor straight away.
  const editing = params.get("edit") === "1";
  // ?changes=1 (from the job page's "What changed") opens the comparison with the master CV.
  const [changes, setChanges] = useState(params.get("changes") === "1");
  // ?print=1 (from a Download → PDF menu elsewhere) opens the print window once the CV has drawn.
  const printNow = params.get("print") === "1";
  const pack = sent ? { ...data!.job.pack!, resume: sent.resume, unverified: [] } : data?.job.pack;

  // The page title becomes the PDF's file name when you choose "Save as PDF".
  // One column by default: hiring software mixes up two-column PDFs (members said so, 22 Nov). The design stays a pick.
  const [plain, setPlain] = useState(true);
  const fileName = pack && data ? `${pack.resume.name} CV ${data.job.company}` : "";
  useEffect(() => {
    if (fileName) document.title = fileName;
  }, [fileName]);
  useEffect(() => {
    if (!printNow || !fileName) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [printNow, fileName]);

  if (!me || data === undefined) return <Loading />;
  if (!data || !pack) {
    return (
      <div className="card mx-auto mt-12 max-w-xl p-8 text-ink-2">
        No tailored CV for this job yet. <Link className="underline" href={`/jobs/${id}`}>Back to the job</Link>
      </div>
    );
  }
  const { job } = data;
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="no-print flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link href={`/jobs/${job._id}`} className="text-sm text-ink-3 hover:text-ink">
          ← {job.title} at {job.company}
        </Link>
        <div className="flex items-center gap-3">
          <CvLayoutPick plain={plain} onChange={setPlain} />
          {!pack.letterOnly && (
            <button type="button" className={`btn btn-sm ${changes ? "btn-primary" : "btn-ghost"}`} aria-pressed={changes} onClick={() => setChanges(!changes)}>
              What changed
            </button>
          )}
          {!sent && (
            <a href="#edit" className="btn btn-ghost btn-sm" onClick={() => (document.getElementById("edit") as HTMLDetailsElement | null)?.setAttribute("open", "")}>
              Edit
            </a>
          )}
          <DownloadMenu primary onWord={() => void downloadDocx(pack.resume, `${pack.resume.name} CV ${job.company}`)} />
        </div>
      </div>
      {pack.unverified.length > 0 && (
        <p className="no-print w-full max-w-[210mm] rounded-lg bg-warn/10 p-3 text-sm text-warn">
          Check before sending: {pack.unverified.join(", ")} {pack.unverified.length === 1 ? "isn't" : "aren't"} in your master CV.
        </p>
      )}
      {!sent && !pack.letterOnly && <TwoPages jobId={job._id} resume={pack.resume} shortened={pack.shortened} edited={!!pack.written} />}
      {changes && all && (
        <section className="no-print card w-full max-w-[210mm] p-5">
          <h2 className="mb-3 text-base font-semibold">What changed from your master CV</h2>
          <CvChanges
            tailored={pack.resume}
            masters={all}
            defaultMasterId={(job.pack?.trackKey && me.tracks.find((t) => t.key === job.pack?.trackKey)?.resumeId) || me.defaultResumeId}
          />
        </section>
      )}
      <div className="max-w-full overflow-x-auto">
        <ResumeDoc r={pack.resume} photoUrl={me.photoUrl} logos={logoMap((all ?? []).map((m) => m.resume))} plain={plain} />
      </div>
      {sent ? (
        <p className="no-print w-full max-w-[210mm] text-sm text-ink-2">The CV you sent on {new Date(sent.at).toLocaleDateString()}. It stays as it was when you rewrite this job&apos;s CV.</p>
      ) : (
      <details id="edit" className="no-print card w-full max-w-[210mm] p-6" open={editing}>
        <summary className="cursor-pointer font-medium">Edit this CV</summary>
        <p className="mb-4 mt-2 text-sm text-ink-2">
          Changes show in the CV above, the PDF and the Word file. Numbers are re-checked against your CVs when you save.
          {pack.written ? " You've edited this CV; \"Undo my edits\" brings back the one JobPipe wrote." : ""}
        </p>
        <TailoredEditor key={`${pack.createdAt}:${pack.written ? "edited" : "written"}`} jobId={job._id} resume={pack.resume} edited={!!pack.written} />
      </details>
      )}
    </div>
  );
}

/**
 * When a tailored CV runs past two pages, offers to fit it: your choice, never automatic. Leaves out the side items
 * least related to this job, in this job's copy only, and says what went. "Undo my edits" brings them back.
 */
function TwoPages({ jobId, resume, shortened, edited }: { jobId: Id<"jobs">; resume: Resume; shortened?: string[]; edited: boolean }) {
  const fit = useMutation(api.jobs.fitTwoPages);
  const restore = useMutation(api.jobs.restoreTailoredResume);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const pages = estimatePages(resume);
  if (!shortened?.length && pages <= TWO_PAGES) return null;
  return (
    <div className="no-print w-full max-w-[210mm] rounded-lg bg-soft p-4 text-sm">
      {shortened?.length ? (
        <>
          <p className="font-medium">{pages <= TWO_PAGES ? "Fitted on two pages for this job" : `Shortened to about ${pages.toFixed(1)} pages for this job`}</p>
          <p className="mt-1 text-ink-2">
            Left out of this copy only (your master CV keeps everything). Tools, skills, languages, awards, certifications and leadership lines are always kept
            {pages > TWO_PAGES ? ", so to reach two pages, use Edit to shorten the longest bullets" : ""}:
          </p>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {shortened.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="font-medium">This CV runs to about {pages.toFixed(1)} pages. Most recruiters prefer two.</p>
          <p className="mt-1 text-ink-2">
            We can leave out the side items least related to this job (like side projects, communities and school notes) until it fits. Your experience stays as it is, nothing is reworded, and your master CV isn&apos;t touched. You&apos;ll see exactly what was left out.
          </p>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!shortened?.length && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(
                await attempt(async () => {
                  const out = await fit({ jobId });
                  if (!out.left.length) return `Nothing here can be left out without losing something important (tools, skills, languages, awards, certifications and leadership lines are always kept). To reach two pages, write the CV again (each role now keeps only its most relevant bullets), or use Edit to shorten the longest bullets.`;
                }),
              );
              setBusy(false);
            }}
          >
            {busy ? "Fitting…" : "Fit it on two pages"}
          </button>
        )}
        {edited && !!shortened?.length && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Put back everything that was left out? This also undoes any edits you made to this CV.")) return;
              setBusy(true);
              setState(await attempt(async () => (await restore({ jobId }), "Back to the CV JobPipe wrote.")));
              setBusy(false);
            }}
          >
            Put it all back
          </button>
        )}
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}
