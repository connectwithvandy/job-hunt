"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/jobs", label: "Jobs" },
  { href: "/tracker", label: "Tracker" },
  { href: "/network", label: "Network" },
  { href: "/resume", label: "Master CV" },
  { href: "/tracks", label: "Tracks" },
];

export function Sidebar() {
  const path = usePathname();
  if (path.endsWith("/resume") && path.startsWith("/jobs/")) return null;
  return (
    <aside className="no-print md:w-56 md:shrink-0 md:min-h-screen md:border-r border-line px-5 py-5 md:py-10 flex md:flex-col gap-6 items-center md:items-stretch">
      <Link href="/" className="display text-lg uppercase leading-none tracking-wide">
        Job Hunt<span className="text-accent">.</span>
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
    </aside>
  );
}
