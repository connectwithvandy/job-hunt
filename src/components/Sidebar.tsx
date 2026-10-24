"use client";

import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/chat", label: "Chat" },
  { href: "/jobs", label: "Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/messages", label: "Messages" },
  { href: "/tracker", label: "Tracker" },
  { href: "/network", label: "Network" },
  { href: "/resume", label: "CVs" },
  { href: "/tracks", label: "Roles" },
];

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
        {(isOwner ? [...NAV, { href: "/waitlist", label: "Waitlist" }] : NAV).map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-2.5 py-2 whitespace-nowrap transition-colors md:px-3 ${
                active ? "bg-soft font-medium text-accent" : "text-ink-2 hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <button type="button" onClick={() => void signOut()} className="ml-auto text-left text-xs text-ink-3 hover:text-ink md:mt-auto md:ml-0 md:px-3">
        Sign out
      </button>
    </aside>
  );
}
