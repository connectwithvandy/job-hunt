"use client";

import { useRateLimit } from "@convex-dev/rate-limiter/react";
import { useQuery } from "convex/react";
import { useState, useTransition } from "react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "@/lib/errors";

export type ActionState = { error?: string; message?: string } | null;

/** Run a Convex call and turn the result or error into something to show. */
export async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return message ? { message } : null;
  } catch (err) {
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
    <span className="inline-flex flex-col items-start gap-1">
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
    </span>
  );
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

/** LinkedIn's new-message page with the message already typed in; you pick the person in "To". */
export const linkedinCompose = (text: string) => `https://www.linkedin.com/messaging/compose/?body=${encodeURIComponent(text)}`;

/**
 * Copy a message, then open LinkedIn so it can be sent by hand. With `compose` (people you're already connected to),
 * LinkedIn opens a new message with the text filled in, and you type their name in "To". Otherwise it opens their profile to paste into.
 */
export function CopyAndOpen({ text, url, label = "Copy note & open LinkedIn", compose }: { text: string; url: string; label?: string; compose?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (compose) window.open(linkedinCompose(text), "_blank", "noopener");
        else if (url) window.open(url, "_blank", "noopener");
        setTimeout(() => setCopied(false), compose ? 6000 : 2500);
      }}
    >
      {copied ? (compose ? `Message ready. Type ${compose} in "To" and send` : "Copied. Paste it in LinkedIn") : label}
    </button>
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
  if (!me || me.isOwner || left === undefined) return null;
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
