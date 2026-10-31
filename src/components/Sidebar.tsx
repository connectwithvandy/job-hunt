"use client";

import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "@/lib/errors";

/** Five places, each with the pages that belong together shown as tabs at the top. */
const NAV = [
  { label: "Today", pages: [{ href: "/", label: "Today" }] },
  { label: "Jobs", pages: [{ href: "/jobs", label: "Jobs" }, { href: "/tracker", label: "Applications" }] },
  { label: "Companies", pages: [{ href: "/companies", label: "Companies" }] },
  { label: "People", pages: [{ href: "/messages", label: "Messages" }, { href: "/network", label: "Your network" }] },
  { label: "Setup", pages: [{ href: "/resume", label: "CVs" }, { href: "/tracks", label: "Roles" }, { href: "/stories", label: "Stories" }] },
];

const isOn = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Tabs for the other pages in the same place, like Messages and Your network under People. */
export function SubTabs() {
  const path = usePathname();
  const group = NAV.find((g) => g.pages.some((p) => isOn(path, p.href)));
  if (!group || group.pages.length < 2) return null;
  return (
    <div className="no-print mb-6 flex gap-1 border-b border-line text-sm">
      {group.pages.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          className={`-mb-px border-b-2 px-3 py-2 ${isOn(path, p.href) ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}

/** Chat, one tap away on every page instead of taking a place in the menu. */
export function ChatButton() {
  const path = usePathname();
  if (path.startsWith("/chat")) return null;
  return (
    <Link href="/chat" className="no-print btn btn-primary fixed right-5 bottom-5 z-40 rounded-full shadow-lg">
      Ask JobPipe
    </Link>
  );
}

export function Sidebar({ isOwner }: { isOwner: boolean }) {
  const path = usePathname();
  const { signOut } = useAuthActions();
  return (
    <aside className="no-print sticky top-0 z-30 bg-paper md:static md:w-56 md:shrink-0 md:min-h-screen border-b md:border-b-0 md:border-r border-line px-4 py-3 md:px-5 md:py-10 flex flex-wrap md:flex-nowrap md:flex-col gap-x-4 gap-y-2 md:gap-6 items-center md:items-stretch">
      <Link href="/" className="display text-lg uppercase leading-none tracking-wide">
        JobPipe<span className="text-accent">.</span>
      </Link>
      {/* On a phone every page is in view: the links wrap onto a second row instead of scrolling off the side. */}
      <nav className="order-last flex w-full flex-wrap gap-1 text-sm md:order-none md:w-auto md:flex-col">
        {(isOwner ? [...NAV, { label: "Waitlist", pages: [{ href: "/waitlist", label: "Waitlist" }] }] : NAV).map((n) => {
          const active = n.pages.some((p) => isOn(path, p.href));
          return (
            <Link
              key={n.label}
              href={n.pages[0].href}
              className={`rounded-lg px-2.5 py-2 whitespace-nowrap transition-colors md:px-3 ${
                active ? "bg-soft font-medium text-accent" : "text-ink-2 hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex gap-4 md:mt-auto md:ml-0 md:flex-col md:gap-3 md:px-3">
        {!isOwner && <FeedbackButton />}
        <button type="button" onClick={() => void signOut()} className="text-left text-xs text-ink-3 hover:text-ink">
          Sign out
        </button>
      </div>
    </aside>
  );
}

/** A small box for testers to tell the owner what's broken or missing. */
function FeedbackButton() {
  const send = useMutation(api.feedback.send);
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-left text-xs text-ink-3 hover:text-ink">
        Send feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
            {state === "sent" ? (
              <>
                <p className="font-medium">Thanks, that&apos;s sent.</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setOpen(false), setState("idle"), setText(""))}>
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="font-medium">What&apos;s broken, confusing or missing?</div>
                <textarea className="field h-32 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell it like you'd tell a friend." autoFocus />
                {error && <p className="text-sm text-bad">{error}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={state === "sending" || !text.trim()}
                    onClick={async () => {
                      setState("sending");
                      setError("");
                      try {
                        await send({ text, page: path });
                        setState("sent");
                      } catch (err) {
                        setError(errorMessage(err));
                        setState("idle");
                      }
                    }}
                  >
                    {state === "sending" ? "Sending…" : "Send"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
