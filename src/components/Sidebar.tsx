"use client";

import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { PLANS } from "../../convex/lib/plans";
import { ThemeToggle } from "./ThemeToggle";

/** Five places, each with the pages that belong together shown as tabs at the top. */
const PROFILE = {
  label: "Profile",
  pages: [
    { href: "/account", label: "About you" },
    { href: "/resume", label: "CVs" },
    { href: "/tracks", label: "Roles" },
    { href: "/preferences", label: "Job preferences" },
    // A set-once list that feeds your Jobs each morning, so it lives with your preferences (19 Nov: confusing under Jobs, then Referrals).
    { href: "/companies", label: "Dream companies" },
    { href: "/stories", label: "Proof of work" },
    { href: "/connect", label: "LinkedIn & Gmail" },
    { href: "/billing", label: "Plan & billing" },
    { href: "/notifications", label: "Notifications" },
    { href: "/help", label: "Help & support" },
  ],
};
const NAV = [
  { label: "Today", pages: [{ href: "/", label: "Today" }] },
  { label: "Jobs", pages: [{ href: "/jobs", label: "Jobs" }] },
  { label: "Applications", pages: [{ href: "/tracker", label: "Applications" }] },
  // Referrals live in Messages (19 Nov): every ask, follow-up and reply in one list.
  { label: "Messages", pages: [{ href: "/inbox", label: "Messages" }] },
  PROFILE,
];
/** Your name at the bottom also opens Profile. */
const ACCOUNT = PROFILE;

const isOn = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Tabs for the other pages in the same place, like CVs and Roles under Profile. */
export function SubTabs() {
  const path = usePathname();
  const group = NAV.find((g) => g.pages.some((p) => isOn(path, p.href)));
  // Profile has its own menu down the left (ProfileMenu), like most apps' settings.
  if (!group || group.pages.length < 2 || group === PROFILE) return null;
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

export const inProfile = (path: string) => PROFILE.pages.some((p) => isOn(path, p.href));

/** Profile's pages as a menu down the left on a wide screen, and a row of tabs on a phone. */
export function ProfileMenu() {
  const path = usePathname();
  const me = useQuery(api.access.mine);
  const user = useQuery(api.users.me);
  return (
    <nav className="no-print mb-6 md:sticky md:top-20 md:mb-0 md:w-52 md:shrink-0 md:self-start">
      {me && (
        <div className="mb-5 hidden md:block">
          <div className="text-lg font-semibold">{me.name || "Your profile"}</div>
          <div className="text-xs text-ink-3">{user?.email}</div>
          <InviteFriend />
        </div>
      )}
      <ul className="flex gap-1 overflow-x-auto border-b border-line text-sm md:flex-col md:border-b-0">
        {PROFILE.pages.map((p) => {
          const on = isOn(path, p.href);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                className={`block whitespace-nowrap rounded-lg px-3 py-2 ${on ? "bg-soft font-medium text-ink" : "text-ink-2 hover:bg-soft hover:text-ink"}`}
              >
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Share JobPipe with a friend who's looking. On a computer: our own small box with the link, Copy and the usual
 * apps (Safari's system share menu popped up on a laptop and looked broken, 19 Nov). On a phone: the share sheet.
 * Both sides save: the friend gets 20% off their first plan, and the member 20% off one plan per friend who pays.
 */
function InviteFriend() {
  const me = useQuery(api.access.mine);
  const makeCode = useMutation(api.access.inviteCode);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [done, setDone] = useState("");
  const text = `I'm using JobPipe for my sales job search: it finds sales roles in India, writes a CV for each one and helps me find who I know there. Sign up with my link and you get ${PLANS.invitePercentOff}% off a paid plan:`;
  const linkOf = async () => {
    // Each member's own link, so we can see who joined through whose invite.
    const code = me?.inviteCode ?? (await makeCode());
    return code ? `https://jobpipe.in/?ref=${code}` : "https://jobpipe.in";
  };
  const message = `${text} ${url}`;
  return (
    <div className="relative mt-3">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        aria-expanded={open}
        onClick={async () => {
          try {
            const link = await linkOf();
            setUrl(link);
            const phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
            if (phone && navigator.share) {
              await navigator.share({ title: "JobPipe", text, url: link });
              setDone("Thanks for sharing");
            } else {
              setOpen((o) => !o);
            }
          } catch {
            // Closing the share sheet isn't an error worth showing.
          }
        }}
      >
        Invite a friend
      </button>
      {open && url && (
        <div className="card absolute left-0 top-full z-30 mt-2 w-72 p-4 text-sm shadow-lg">
          <p className="font-medium">Send a friend your link</p>
          <p className="mb-3 mt-1 text-xs text-ink-2">
            They get {PLANS.invitePercentOff}% off a paid plan. When they pay, you get {PLANS.invitePercentOff}% off your next one.
            {!!me?.inviteCredits && ` You have ${me.inviteCredits} to use on Plan & billing.`}
          </p>
          <div className="mb-3 flex items-center gap-2">
            <input readOnly value={url} className="field min-w-0 flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Your invite link" />
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  setDone("Copied. Paste it to a friend.");
                } catch {
                  setDone("Select the link and copy it.");
                }
              }}
            >
              Copy
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <a className="btn btn-sm" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a className="btn btn-sm" href={`mailto:?subject=${encodeURIComponent("Try JobPipe for your sales job search")}&body=${encodeURIComponent(message)}`}>
              Email
            </a>
          </div>
          <button type="button" className="mt-3 text-xs text-ink-3 underline hover:text-ink" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
      {done && <p className="mt-1 text-xs text-ink-3">{done}</p>}
      {!!me?.invited && (
        <p className="mt-1 text-xs text-ink-2">
          {me.invited} {me.invited === 1 ? "friend" : "friends"} joined through your link
        </p>
      )}
    </div>
  );
}

/** Chat, one tap away on every page instead of taking a place in the menu. */
export function ChatButton() {
  const path = usePathname();
  if (path.startsWith("/chat")) return null;
  // On a job's page, the chat starts about that job.
  const jobId = path.match(/^\/jobs\/([a-z0-9]+)(\/|$)/)?.[1];
  return (
    <Link href={jobId ? `/chat?job=${jobId}` : "/chat"} className="no-print btn btn-primary fixed right-5 bottom-5 z-40 rounded-full shadow-lg">
      Ask JobPipe
    </Link>
  );
}

/**
 * The menu as a bar across the top, like Dreamwork (19 Nov): logo, the five places, then your name, Admin,
 * theme and sign out on the right. On a phone the places wrap onto a second row so every one stays in view.
 */
export function TopBar({ isOwner }: { isOwner: boolean }) {
  const path = usePathname();
  const { signOut } = useAuthActions();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:flex-nowrap md:px-8">
        <Link href="/" className="display py-2 text-base uppercase leading-none tracking-wide">
          JobPipe<span className="breathe text-accent">.</span>
        </Link>
        <nav className="order-last -mx-1 flex w-full flex-wrap gap-1 text-sm md:order-none md:w-auto">
          {NAV.map((n) => {
            const active = n.pages.some((p) => isOn(path, p.href));
            return (
              <Link
                key={n.label}
                href={n.pages[0].href}
                className={`rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${active ? "bg-soft font-medium text-ink" : "text-ink-2 hover:bg-soft hover:text-ink"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/help" className={isOn(path, "/help") ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}>
            Help
          </Link>
          {isOwner && (
            <Link href="/admin" className={isOn(path, "/admin") ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}>
              Admin
            </Link>
          )}
          <ThemeToggle />
          <AccountLink active={ACCOUNT.pages.some((p) => isOn(path, p.href))} />
          <button type="button" onClick={() => void signOut()} className="text-ink-2 hover:text-ink">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

const daysLeft = (ms: number) => {
  const d = Math.ceil(ms / 86_400_000);
  return d <= 1 ? "last day" : `${d} days left`;
};

/** Your name and plan, opening the Account page. */
function AccountLink({ active }: { active: boolean }) {
  const me = useQuery(api.access.mine);
  const [now] = useState(() => Date.now());
  if (!me) return null;
  const plan = me.isOwner
    ? "Owner"
    : me.paidUntil && me.paidUntil > now
      ? `Paid until ${new Date(me.paidUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
      : me.trialOver
        ? "Free plan"
        : me.trialEndsAt && me.trialEndsAt > now
        ? `Free trial · ${daysLeft(me.trialEndsAt - now)}`
        : "Free beta";
  return (
    <Link href="/account" title={plan} className={`flex items-center gap-2 text-left text-sm leading-tight ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">{(me.name || "?")[0].toUpperCase()}</span>
      <span className="hidden lg:block">
        <span className="block font-medium">{me.name.split(" ")[0] || "Account"}</span>
        <span className="block text-[11px] text-ink-3">{plan}</span>
      </span>
    </Link>
  );
}
