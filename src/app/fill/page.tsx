"use client";

// The small window the JobPipe autofill bookmark opens on an application form. It sends that form
// page this job's drafted answers, the tailored CV and the cover letter, then the bookmark fills them
// in. Nothing is submitted: the candidate checks the form and presses Submit themselves.
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import { Spinner } from "@/components/ui";
import { applyingJob } from "@/lib/applying";
import { letterDocx, resumeDocx } from "@/lib/docx";

const noSubscribe = () => () => {};

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** greenhouse.io, lever.co, ashbyhq.com, or the company's own site: the part of the address that matters. */
function family(host: string) {
  return host.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

function Fill() {
  const params = useSearchParams();
  const origin = params.get("o") ?? "";
  const formHost = params.get("h") ?? "";
  // Storage and the opener only exist in the browser; on the server both read as "not yet known".
  const jobId = useSyncExternalStore(noSubscribe, applyingJob, () => undefined);
  const hasOpener = useSyncExternalStore(noSubscribe, () => !!window.opener, () => true);
  const data = useQuery(api.applyAnswers.forFill, jobId ? { jobId } : "skip");
  const [state, setState] = useState<"ready" | "sending" | "sent" | "done" | "error">("ready");
  const [result, setResult] = useState<{ filled: number; attached: string[] } | null>(null);
  const sentOnce = useRef(false);

  const linkHost = (() => {
    try {
      return data?.link ? new URL(data.link).hostname : "";
    } catch {
      return "";
    }
  })();
  // The form is on the job's own site: send straight away. Anywhere else, ask first, so no other site can pull your CV.
  const trusted = !!formHost && !!linkHost && family(formHost) === family(linkHost);

  async function send() {
    if (!data || !window.opener || !origin) return;
    setState("sending");
    try {
      const files: { kind: "cv" | "letter"; file: File }[] = [];
      if (data.resume) {
        const blob = await resumeDocx(data.resume);
        files.push({ kind: "cv", file: new File([blob], `${data.resume.name} CV ${data.company}.docx`, { type: DOCX }) });
        if (data.coverLetter) {
          const letter = await letterDocx(data.resume, data.coverLetter);
          files.push({ kind: "letter", file: new File([letter], `${data.resume.name} Cover letter ${data.company}.docx`, { type: DOCX }) });
        }
      }
      const answers = data.coverLetter ? [...data.answers, { question: "Cover letter", answer: data.coverLetter, exact: false }] : data.answers;
      (window.opener as Window).postMessage({ type: "jobpipe-fill", answers, files }, origin);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin || e.data?.type !== "jobpipe-filled") return;
      setResult({ filled: Number(e.data.filled) || 0, attached: Array.isArray(e.data.attached) ? e.data.attached : [] });
      setState("done");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  useEffect(() => {
    if (trusted && data && !sentOnce.current) {
      sentOnce.current = true;
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trusted, data]);

  if (jobId === undefined) return <Spinner />;
  if (!origin || !hasOpener) {
    return <p className="text-ink-2">Open this from the JobPipe bookmark, on an application form.</p>;
  }
  if (!jobId) {
    return (
      <p className="text-ink-2">
        Click <b>Apply</b> on the job in JobPipe first, then click the bookmark on the form. That tells JobPipe which job&apos;s answers and CV to use.
      </p>
    );
  }
  if (data === undefined) return <Spinner />;
  if (data === null) return <p className="text-ink-2">That job isn&apos;t in your JobPipe anymore. Click Apply on the job again.</p>;

  return (
    <div className="space-y-4">
      <div>
        <div className="label">Filling the form for</div>
        <div className="font-medium">
          {data.title} at {data.company}
        </div>
      </div>
      <ul className="space-y-1 text-sm text-ink-2">
        <li>{data.answers.filter((a) => a.exact && a.answer).length} answers to this form&apos;s own questions, plus your saved answers</li>
        <li>{data.resume ? (data.tailored ? "Your tailored CV" : "Your CV (not tailored for this job yet)") : "No CV yet: upload one on the CVs page"}</li>
        {data.coverLetter && <li>Your cover letter</li>}
      </ul>
      {state === "ready" && !trusted && (
        <div className="space-y-2">
          <p className="text-sm text-warn">
            This form is on <b>{formHost || "another site"}</b>, not where JobPipe found the job ({linkHost || "unknown"}). Only send if you opened it from the job&apos;s Apply link.
          </p>
          <button className="btn btn-primary" onClick={() => void send()}>
            Fill the form on {formHost}
          </button>
        </div>
      )}
      {(state === "sending" || state === "sent") && (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Spinner /> Filling the form…
        </p>
      )}
      {state === "done" && result && (
        <div className="space-y-2">
          <p className="font-medium">
            Filled {result.filled} {result.filled === 1 ? "field" : "fields"}
            {result.attached.length ? ` and attached your ${result.attached.join(" and ")}` : ""}.
          </p>
          <p className="text-sm text-ink-2">
            Go back to the form. Check every green-outlined field, answer anything left blank, pick any dropdowns JobPipe couldn&apos;t, then press <b>Submit</b> yourself.
            {data.needsYou > 0 && ` ${data.needsYou} ${data.needsYou === 1 ? "question needs" : "questions need"} your own answer.`}
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => window.close()}>
            Close this window
          </button>
        </div>
      )}
      {state === "error" && <p className="text-sm text-warn">Something went wrong building your CV file. Close this window and click the bookmark again.</p>}
    </div>
  );
}

export default function FillPage() {
  return (
    <div className="mx-auto max-w-sm">
      <div className="display mb-4 text-xl">JobPipe autofill</div>
      <Suspense fallback={<Spinner />}>
        <Fill />
      </Suspense>
    </div>
  );
}
