"use client";

import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  // On a phone the tabs scroll sideways: bring the open one into view (27 Nov review: "Plan & billing" sat off-screen,
  // so nothing showed where you were). Scrolls only the row, never the page.
  const row = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  useEffect(() => {
    const ul = row.current;
    const on = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !on || ul.scrollWidth <= ul.clientWidth) return;
    // Part of the tab before it stays in view, so the row shows there is more on both sides (28 Nov review).
    ul.scrollLeft = Math.max(0, on.offsetLeft - ul.offsetLeft - 56);
    setAtStart(ul.scrollLeft < 4);
  }, [path]);
  return (
    <nav className="no-print mb-6 md:sticky md:top-20 md:mb-0 md:w-52 md:shrink-0 md:self-start">
      {me && (
        <div className="mb-5 hidden md:block">
          <div className="h2">{me.name || "Your profile"}</div>
          <div className="truncate text-[13px] text-ink-3" title={user?.email}>{user?.email}</div>
          <InviteFriend />
        </div>
      )}
      <ul
        ref={row}
        onScroll={(e) => setAtStart(e.currentTarget.scrollLeft < 4)}
        className={`flex gap-1 overflow-x-auto border-b border-line text-sm max-md:pr-8 md:flex-col md:border-b-0 ${atStart ? "max-md:[mask-image:linear-gradient(to_right,black_85%,transparent)]" : "max-md:[mask-image:linear-gradient(to_right,transparent,black_12%,black_85%,transparent)]"}`}
      >
        {PROFILE.pages.map((p) => {
          const on = isOn(path, p.href);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-9 items-center whitespace-nowrap px-3 py-2 text-[14px] max-md:-mb-px max-md:border-b-2 md:rounded-lg [@media(pointer:coarse)]:min-h-11 ${on ? "font-semibold text-ink max-md:border-ink md:bg-soft" : "text-ink-2 max-md:border-transparent hover:text-ink md:hover:bg-soft"}`}
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
        className="btn btn-secondary btn-sm"
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

/** "JobPipe" with "Pipe" on a lime marker band. */
export function Logo() {
  return (
    <span className="logo">
      Job<b>Pipe</b>
    </span>
  );
}

/** The chat link: on a job's page it starts about that job. */
function askHref(path: string) {
  const jobId = path.match(/^\/jobs\/([a-z0-9]+)(\/|$)/)?.[1];
  return jobId ? `/chat?job=${jobId}` : "/chat";
}

/** Ask JobPipe is a place in the menu (desktop) and a tab (phone), not a floating button over the page. */
const MAIN = [
  { label: "Today", short: "Today", href: "/", icon: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" },
  { label: "Jobs", short: "Jobs", href: "/jobs", icon: "M4 8h16v11H4zM9 8V5h6v3" },
  { label: "Applications", short: "Applications", href: "/tracker", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z" },
  { label: "Messages", short: "Messages", href: "/inbox", icon: "M4 6h16v10H8l-4 4z" },
];
const ASK_ICON = "M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/**
 * Desktop: one bar with the logo, the places, then theme and your avatar menu. Phone: a short top bar with the
 * logo and avatar (not sticky), and the places in a tab bar at the bottom where thumbs reach (BottomTabs).
 */
export function TopBar({ isOwner }: { isOwner: boolean }) {
  const path = usePathname();
  const places = [...MAIN, { label: "Profile", short: "Profile", href: "/account", icon: "" }, { label: "Ask", short: "Ask", href: askHref(path), icon: ASK_ICON }];
  const activeOf = (href: string, label: string) =>
    label === "Profile" ? inProfile(path) : label === "Ask" ? path.startsWith("/chat") : isOn(path, href);
  return (
    <header className="no-print border-b border-line bg-card md:sticky md:top-0 md:z-30 md:bg-card/90 md:backdrop-blur">
      <div className="mx-auto flex h-[52px] max-w-7xl items-center gap-6 px-4 md:h-16 md:px-8">
        <Link href="/" aria-label="JobPipe, Today" className="flex min-h-11 items-center">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Main">
          {places.map((n) => {
            const active = activeOf(n.href, n.label);
            return (
              <Link
                key={n.label}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-2 whitespace-nowrap ${active ? "bg-soft font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden md:grid" />
          <AvatarMenu isOwner={isOwner} />
        </div>
      </div>
    </header>
  );
}

/** Phone only: the places as a tab bar fixed to the bottom, frosted, above the home indicator. */
export function BottomTabs() {
  const path = usePathname();
  const tabs = [...MAIN, { label: "Ask", short: "Ask", href: askHref(path), icon: ASK_ICON }];
  return (
    <nav
      aria-label="Main"
      className="tabbar no-print fixed inset-x-0 bottom-0 z-40 border-t border-line md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid h-14 grid-cols-5">
        {tabs.map((t) => {
          const active = t.label === "Ask" ? path.startsWith("/chat") : isOn(path, t.href);
          return (
            <li key={t.label}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold tracking-[-0.01em] max-[360px]:text-[10.5px] max-[340px]:text-[10px] ${active ? "text-ink" : "text-ink-3"}`}
              >
                <Icon d={t.icon} />
                {t.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Escape closes a menu or sheet. */
export function useEscape(open: boolean, close: () => void) {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
}

const daysLeft = (ms: number) => {
  const d = Math.ceil(ms / 86_400_000);
  return d <= 1 ? "last day" : `${d} days left`;
};

/** Your avatar opens a small menu: plan, Profile, Help, theme (phone), Admin (owner), Sign out. A bottom sheet on a phone. */
function AvatarMenu({ isOwner }: { isOwner: boolean }) {
  const me = useQuery(api.access.mine);
  const { signOut } = useAuthActions();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const [lastPath, setLastPath] = useState(path);
  const button = useRef<HTMLButtonElement>(null);
  useEscape(open, () => {
    setOpen(false);
    button.current?.focus();
  });
  if (lastPath !== path) {
    setLastPath(path);
    setOpen(false);
  }
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
  const item = "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-soft md:min-h-9";
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-label={`Account, ${plan}`}
        onClick={() => setOpen((o) => !o)}
        className="grid h-11 w-11 place-items-center rounded-full md:h-9 md:w-9"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-semibold text-paper">{(me.name || "?")[0].toUpperCase()}</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default bg-black/30 md:bg-transparent" onClick={() => setOpen(false)} />
          <nav
            aria-label="Account"
            className="sheet card pop fixed inset-x-0 bottom-0 z-50 rounded-b-none p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-full md:mt-2 md:w-64 md:rounded-b-[16px] md:pb-2"
          >
            <div className="px-3 pt-2 pb-3">
              <div className="text-sm font-semibold">{me.name || "Your account"}</div>
              <div className="text-[13px] text-ink-3">{plan}</div>
            </div>
            <Link href="/account" className={item}>Profile</Link>
            <Link href="/billing" className={item}>Plan &amp; billing</Link>
            <Link href="/help" className={item}>Help</Link>
            {isOwner && <Link href="/admin" className={item}>Admin</Link>}
            <div className="md:hidden">
              <ThemeToggle labelled className={`${item} [&>span]:not-sr-only`} />
            </div>
            <div className="my-1 border-t border-line" />
            <button type="button" className={item} onClick={() => void signOut()}>
              Sign out
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
