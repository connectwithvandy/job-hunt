"use client";

import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/jobs", label: "Jobs" },
  { href: "/tracker", label: "Tracker" },
  { href: "/network", label: "Network" },
  { href: "/resume", label: "CVs" },
  { href: "/tracks", label: "Roles" },
];

export function Sidebar() {
  const path = usePathname();
  const { signOut } = useAuthActions();
  return (
    <aside className="no-print md:w-56 md:shrink-0 md:min-h-screen md:border-r border-line px-5 py-5 md:py-10 flex md:flex-col gap-6 items-center md:items-stretch">
      <Link href="/" className="display text-lg uppercase leading-none tracking-wide">
        JobPipe<span className="text-accent">.</span>
      </Link>
      <nav className="flex md:flex-col gap-1 overflow-x-auto text-sm">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 whitespace-nowrap transition-colors ${
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
