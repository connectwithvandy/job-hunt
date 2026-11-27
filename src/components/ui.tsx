"use client";

import { useRateLimit } from "@convex-dev/rate-limiter/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { api } from "../../convex/_generated/api";
import { PAYWALL_MARK, PLANS } from "../../convex/lib/plans";
import { errorMessage, reportError } from "@/lib/errors";

export type ActionState = { error?: string; message?: string } | null;

/** Run a Convex call and turn the result or error into something to show. */
export async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return message ? { message } : null;
  } catch (err) {
    reportError(err);
    return { error: errorMessage(err) };
  }
}

/** A button that runs a server action and shows its progress and result inline. */
export function ActionButton({
  run,
  children,
  pending,
  variant = "primary",
  size,
}: {
  run: () => Promise<string | void>;
  children: React.ReactNode;
  pending?: string;
  variant?: "primary" | "ghost";
  size?: "sm";
}) {
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => start(async () => setState(await attempt(run)))}
        className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""}`}
      >
        {busy && <Spinner />}
        {busy ? (pending ?? "Working…") : children}
      </button>
      <Feedback state={busy ? null : state} />
    </span>
  );
}

export function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <span className={`text-xs ${state.error ? "text-bad" : "text-good"}`} role="status">
      {state.error ?? state.message}
      {state.error && <PassButton error={state.error} />}
    </span>
  );
}

/** Under a "needs a pass" message: the way to pay, one tap away, instead of a dead end. */
export function PassButton({ error }: { error: string }) {
  const note = useMutation(api.access.notePaywall);
  const hit = error.includes(PAYWALL_MARK);
  // Once per message shown: who reached a paid-only limit is who to write to first.
  useEffect(() => {
    if (hit) note({ what: error }).catch(() => {});
  }, [hit, error, note]);
  if (!hit) return null;
  return (
    <Link href="/billing" className="btn btn-primary btn-sm mt-2 flex w-fit">
      Get the {PAYWALL_MARK} · from ₹{PLANS.foundingPass}
    </Link>
  );
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

/** LinkedIn's new-message page with the message already typed in; you pick the person in "To". */
export const linkedinCompose = (text: string) => `https://www.linkedin.com/messaging/compose/?body=${encodeURIComponent(text)}`;

// "Did you send it?": a note copied and opened in LinkedIn, WhatsApp or email can't be seen from here, so when you
// come back to this tab the item asks once. Kept in sessionStorage so a reload still asks. 19 Nov: the owner asked
// how JobPipe knows a referral ask really went out.
const OPENED_KEY = "jobpipe:opened";
const OPENED_EVENT = "jobpipe:opened";

function readOpened(): Record<string, number> {
  try {
    const all = JSON.parse(sessionStorage.getItem(OPENED_KEY) ?? "{}") as Record<string, number>;
    // A day old is forgotten: by then the item shows as sent or not on its own.
    return Object.fromEntries(Object.entries(all).filter(([, at]) => Date.now() - at < 86_400_000));
  } catch {
    return {};
  }
}

function writeOpened(all: Record<string, number>) {
  try {
    sessionStorage.setItem(OPENED_KEY, JSON.stringify(all));
  } catch {
    // Private windows can refuse storage; the item then just doesn't ask.
  }
  window.dispatchEvent(new Event(OPENED_EVENT));
}

/** Remember that this item's message was just opened somewhere else, so coming back asks whether it went. */
export function noteOpened(id: string) {
  writeOpened({ ...readOpened(), [id]: Date.now() });
}

function forgetOpened(id: string) {
  const all = readOpened();
  delete all[id];
  writeOpened(all);
}

/**
 * "Did you send it? Yes / Not yet", shown once you're back on this tab after opening the message elsewhere.
 * `question` and `yes` change the words, e.g. "Did you apply?" after the application form was opened.
 */
export function SentCheck({ id, onSent, who, question, yes = "Yes, sent" }: { id: string; onSent: () => Promise<unknown>; who?: string; question?: string; yes?: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Opened more than a few seconds ago (a reload after coming back) asks straight away.
    const check = (returned: boolean) => {
      const at = readOpened()[id];
      setAsk(!!at && (returned || Date.now() - at > 5000));
    };
    check(false);
    const back = () => document.visibilityState === "visible" && check(true);
    const opened = () => setAsk(false);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    window.addEventListener(OPENED_EVENT, opened);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
      window.removeEventListener(OPENED_EVENT, opened);
    };
  }, [id]);
  if (!ask) return null;
  return (
    <span className="flex basis-full flex-wrap items-center gap-2 rounded-lg bg-soft px-3 py-2 text-sm" role="status">
      <span className="font-medium">{question ?? `Did you send it${who ? ` to ${who}` : ""}?`}</span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSent();
            forgetOpened(id);
          } finally {
            setBusy(false);
          }
        }}
      >
        {yes}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => forgetOpened(id)}>
        Not yet
      </button>
    </span>
  );
}

/**
 * Copy a message, then open LinkedIn so it can be sent by hand. With their profile link, it opens that person's
 * profile, so the message can only go to them: click Message there and paste. LinkedIn's "new message" page
 * can't be addressed to someone by link, and people picked the wrong person in "To" (13 Nov), so it's used only
 * when there's no profile link. `compose` is their first name, for the hint.
 */
export function CopyAndOpen({
  text,
  url,
  label = "Copy note & open LinkedIn",
  compose,
  sent,
}: {
  text: string;
  url: string;
  label?: string;
  compose?: string;
  /** Ask "Did you send it?" on coming back, and mark it sent on Yes. */
  sent?: { id: string; onSent: () => Promise<unknown>; who?: string };
}) {
  const [copied, setCopied] = useState(false);
  const profile = /linkedin\.com\/in\//i.test(url);
  const blank = !!compose && !profile;
  return (
    <>
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (sent) noteOpened(sent.id);
        if (blank) window.open(linkedinCompose(text), "_blank", "noopener");
        else if (url) window.open(url, "_blank", "noopener");
        setTimeout(() => setCopied(false), 8000);
      }}
    >
      {copied
        ? blank
          ? `Message ready. Type ${compose} in "To" and send`
          : compose
            ? `Copied. On ${compose}'s profile, click Message and paste`
            : "Copied. Paste it in LinkedIn"
        : label}
    </button>
    {sent && <SentCheck id={sent.id} onSent={sent.onSent} who={sent.who} />}
    </>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * One "Download" menu for a CV: PDF (the browser's print window, "Save as PDF") and a Word file. Replaces two
 * side-by-side buttons on the CV pages (19 Nov). `pdfHref` opens the CV's own page and prints it there, for places
 * that don't show the CV itself, like the job page.
 */
export function DownloadMenu({ onWord, pdfHref, primary }: { onWord: () => void; pdfHref?: string; primary?: boolean }) {
  const close = (e: React.MouseEvent) => e.currentTarget.closest("details")?.removeAttribute("open");
  return (
    <details className="no-print relative">
      <summary className={`btn btn-sm list-none ${primary ? "btn-primary" : "btn-ghost"} [&::-webkit-details-marker]:hidden`}>Download ▾</summary>
      <div className="card absolute right-0 z-30 mt-1 w-56 p-1 text-sm shadow-lg">
        {pdfHref ? (
          <Link href={pdfHref} className="block rounded-md px-3 py-2 hover:bg-soft" onClick={close}>
            PDF
            <span className="block text-xs text-ink-3">Opens the CV, then pick &quot;Save as PDF&quot;</span>
          </Link>
        ) : (
          <button
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left hover:bg-soft"
            onClick={(e) => {
              close(e);
              window.print();
            }}
          >
            PDF
            <span className="block text-xs text-ink-3">Pick &quot;Save as PDF&quot;, headers and footers off</span>
          </button>
        )}
        <button
          type="button"
          className="block w-full rounded-md px-3 py-2 text-left hover:bg-soft"
          onClick={(e) => {
            close(e);
            onWord();
          }}
        >
          Word file
          <span className="block text-xs text-ink-3">For forms that ask for .docx</span>
        </button>
      </div>
    </details>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}

/** "12 left today" for one daily allowance. Hidden for the owner, who has no limit. */
export function LeftToday({ kind, label }: { kind: "scoresLeft" | "cvsLeft" | "notesLeft"; label: string }) {
  const me = useQuery(api.users.me);
  const left = useLeftToday(kind);
  const paused = useQuery(api.limits.aiPaused);
  if (!me || me.isOwner || left === undefined) return null;
  if (paused) return <span className="text-xs text-warn">JobPipe&apos;s AI is busy for today; back tomorrow morning</span>;
  return (
    <span className={`text-xs ${left === 0 ? "text-warn" : "text-ink-3"}`}>
      {left === 0 ? `No ${label} left today` : `${left} ${label} left today`}
    </span>
  );
}

/** How many of one daily allowance are left, or undefined while loading. */
export function useLeftToday(kind: "scoresLeft" | "cvsLeft" | "notesLeft") {
  const { check } = useRateLimit(api.limits[kind], { getServerTimeMutation: api.limits.getServerTime });
  const value = check?.()?.value;
  return value === undefined ? undefined : Math.max(0, Math.floor(value));
}
