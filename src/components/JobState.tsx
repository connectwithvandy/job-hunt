"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useEscape } from "@/components/Sidebar";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSetStatus } from "@/components/Celebrate";
import { CompanyMark, dayStart, timeAgo } from "@/components/bits";
import { showCompany, showPlace, showTitle } from "@/lib/tidy";
import { STAGE_WORDS } from "@/lib/stages";

/** What a job's button needs to know. Today passes full jobs, Jobs the list's lighter ones. */
type StateJob = { _id: Id<"jobs">; status: string; url: string; company: string; title: string; hasPack?: boolean; pack?: unknown; location?: string; workSetting?: string; postedAt?: string; scores?: unknown[] };

/** Where a job stands, which decides its button: rough guess or scored without a CV → "Apply" (opens the job);
 *  CV ready → "Apply ↗" (opens the posting); started → "Mark applied". */
export type JobState = "open" | "ready" | "started";
export const stateOf = (j: StateJob): JobState => (j.status === "applying" ? "started" : j.hasPack || j.pack ? "ready" : "open");

/** The state's button. `primary` only for Do this first: one lime button per screen. */
export function StateButton({ j, primary, full, hideOpen }: { j: StateJob; primary?: boolean; full?: boolean; hideOpen?: boolean }) {
  const setStatus = useSetStatus();
  const setQuietly = useMutation(api.jobs.setStatus);
  const [busy, setBusy] = useState(false);
  const cls = `btn ${primary ? "btn-primary" : "btn-secondary btn-sm"} ${full ? "w-full sm:w-auto" : "shrink-0"}`;
  const st = stateOf(j);
  // Not scored yet: the job page asks to score first, so the button says Open, not Apply (27 Nov review).
  // In a list the whole row opens the job, so a button that only says "Open" is noise (27 Nov review).
  if (st === "open" && hideOpen && !j.scores?.length) return null;
  if (st === "open")
    return (
      <Link href={j.scores?.length ? `/jobs/${j._id}` : `/jobs/${j._id}#fit`} className={cls}>
        {j.scores?.length ? "Apply" : "Open"}
      </Link>
    );
  if (st === "ready")
    return (
      <a
        href={j.url}
        target="_blank"
        rel="noreferrer"
        className={cls}
        aria-label={`Apply at ${j.company} (opens the posting)`}
        onClick={() => void setQuietly({ jobId: j._id, status: "applying" }).catch(() => {})}
      >
        Apply ↗
      </a>
    );
  return (
    <button
      type="button"
      className={cls}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void setStatus({ jobId: j._id, status: "applied" })
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Saving…" : "Mark applied"}
    </button>
  );
}

/** "onsite" → "On-site", "remote" → "Remote". */
export const workMode = (w?: string) => (!w ? null : /on.?site/i.test(w) ? "On-site" : w[0].toUpperCase() + w.slice(1).toLowerCase());

export function metaOf(j: StateJob, pay?: string | null, via?: boolean) {
  // One line, each part whole ("On-site" never splits); the work setting steps aside on a phone.
  // Company and age first (the facts that matter most); place and work setting last, so a narrow screen cuts those.
  const parts: { text: string; phoneHide?: boolean; strong?: boolean }[] = [
    { text: `${via ? "via " : ""}${showCompany(j.company)}` },
    ...(j.postedAt ? [{ text: postedAgo(j.postedAt) }] : []),
    ...(showPlace(j) ? [{ text: showPlace(j) }] : []),
    ...(workMode(j.workSetting) ? [{ text: workMode(j.workSetting)! }] : []),
    // Pay last, in 600 (it's listed only when the posting gives it).
    ...(pay ? [{ text: pay, strong: true }] : []),
  ];
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={p.phoneHide ? "max-sm:hidden" : ""}>
          {/* The dot rides at the end of each part, so a wrapped line never starts with "·". */}
          <span className={`whitespace-nowrap ${p.strong ? "tnum font-semibold text-ink" : ""}`}>
            {p.text}
            {i < parts.length - 1 && "\u00a0·"}
          </span>
          {i < parts.length - 1 && " "}
        </span>
      ))}
    </>
  );
}

/** A posting's age, with a plain warning once it's 3 weeks old: roles that old are often filled (27 Nov review). */
export const postedAgo = (postedAt: string) => `${ago(postedAt)}${Date.now() - Date.parse(postedAt) > 21 * 86_400_000 ? ", may be filled" : ""}`;

/** "22 days ago", "2 months ago": words, not "22d". */
export const ago = (when: string | number) => timeAgo(when).replace(/(\d+)d ago/, (_, n) => `${n} ${n === "1" ? "day" : "days"} ago`).replace(/(\d+)mo ago/, (_, n) => `${n} ${n === "1" ? "month" : "months"} ago`);


/** The stage a job's status reads as, in the same sales words as Today and Applications (src/lib/stages.ts). */
export const STAGE_OF: Record<string, string> = STAGE_WORDS;

/** "PROSPECT ▾": the job's stage as a chip that opens a menu to move it (a sheet on a phone). */
export function StageChip({ jobId, status, qualified }: { jobId: Id<"jobs">; status: string; qualified?: boolean }) {
  // An open job with a real fit of 60+ reads "Qualified", as Today counts it (27 Nov review: 82 under "Prospect").
  const word = status === "new" && qualified ? "Qualified" : (STAGE_OF[status] ?? status);
  const setStatus = useSetStatus();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEscape(open, () => {
    setOpen(false);
    button.current?.focus();
  });
  return (
    <span className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-label={`Stage: ${word}. Change stage`}
        onClick={() => setOpen((o) => !o)}
        className="mono relative inline-flex min-h-8 items-center gap-1 rounded-full border border-line-strong bg-card px-3 !text-ink after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
      >
        {word} <span aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default bg-black/30 md:bg-transparent" onClick={() => setOpen(false)} />
          <div aria-label="Move to" className="sheet card pop fixed inset-x-0 bottom-0 z-50 rounded-b-none p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] md:absolute md:inset-x-auto md:bottom-auto md:left-0 md:top-full md:mt-2 md:w-60 md:rounded-b-[16px] md:pb-2">
            <p className="px-3 pt-2 pb-2 text-[13px] font-semibold text-ink-2">Move to</p>
            {Object.entries(STAGE_OF).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === status}
                className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-[15px] hover:bg-soft md:min-h-9 ${k === status ? "font-semibold" : ""}`}
                onClick={() => {
                  setOpen(false);
                  if (k !== status) void setStatus({ jobId, status: k as Parameters<typeof setStatus>[0]["status"] });
                }}
              >
                {label}
                {k === status && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/** Whole days since a date, counted the same way as "22 days ago" everywhere (days start at 4 AM). */
export const daysSince = (when: number) => Math.max(0, Math.round((dayStart(Date.now()) - dayStart(when)) / 86_400_000));

/**
 * One job as a list row, the same on Today and Jobs: logo, title and one line of detail (the title link covers the
 * row), the fit ring, the job's button when it has a real next step, then save and "not for me".
 */
export function JobRow({
  j,
  href,
  onOpen,
  meta,
  ring,
  onDismiss,
  save,
  selected,
  check,
  tagLine,
}: {
  /** Short status tags shown on their own line under the details. */
  tagLine?: React.ReactNode;
  selected?: boolean;
  /** A checkbox for picking several jobs at once (Jobs → Select). */
  check?: React.ReactNode;
  j: StateJob & { companyLogo?: string; sourceUrl?: string };
  href: string;
  onOpen?: (e: React.MouseEvent) => void;
  meta: React.ReactNode;
  ring: React.ReactNode;
  onDismiss?: () => void;
  save?: React.ReactNode;
}) {
  // "Open" shows too, so a row reads the same on a phone and a computer (27 Nov review).
  const button = <StateButton j={j} />;
  const dismiss = onDismiss && (
    <button type="button" className="btn-icon" aria-label={`Not for me: ${j.company}`} title="Not for me" onClick={onDismiss}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
  const hasButton = true;
  return (
    <li className={`row row-link items-start sm:items-center ${selected ? "bg-soft" : ""}`} aria-current={selected || undefined}>
      {check && <span className="above flex h-8 shrink-0 items-center">{check}</span>}
      <CompanyMark job={j} size={32} />
      <div className="min-w-0 flex-1">
        <Link href={href} onClick={onOpen} scroll={false} className="stretch row-title line-clamp-2 rounded-sm sm:line-clamp-1">
          {showTitle(j.title)}
        </Link>
        <span className="row-meta line-clamp-2 sm:line-clamp-1">{meta}</span>
        {tagLine !== undefined && <span className="mt-1 block min-h-4 truncate leading-4">{tagLine}</span>}
        {/* Phone: the job's button, save and "not for me" in one row under the details, so the title gets the width
            (27 Nov review: at 320px the icons took a third of the row). Each icon is 44px to tap. */}
        {(hasButton || save || onDismiss) && (
          <div className="above mt-2 flex items-center gap-1 sm:hidden">
            {hasButton && button}
            <span className="flex-1" />
            {save}
            {dismiss}
          </div>
        )}
      </div>
      {hasButton && <div className="above hidden shrink-0 sm:block">{button}</div>}
      {ring && <span className="flex w-10 shrink-0 justify-center max-sm:w-9">{ring}</span>}
      {/* Save and "not for me" beside the ring with a mouse. */}
      <span className="above hidden shrink-0 items-center gap-1 sm:flex">
        {save && <span className="reveal-on-hover inline-flex">{save}</span>}
        {dismiss && <span className="reveal-on-hover inline-flex">{dismiss}</span>}
      </span>
    </li>
  );
}
