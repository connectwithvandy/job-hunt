"use client";

import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { Logo } from "@/components/Sidebar";
import { ThemeToggle } from "./ThemeToggle";

/**
 * One menu on every public page: home, pricing, the guides, the salary calculator, the free CV review, the legal
 * pages (27 Nov review: each page had its own, and some had no way to sign in). Logo home, FAQ, Pricing, Free CV
 * review, theme, then Sign in and Start free, or "Open JobPipe" when already signed in. On the home page the two
 * buttons switch the form beside the headline instead of reloading.
 */
export function PublicHeader({ onSignIn, onStart }: { onSignIn?: () => void; onStart?: () => void } = {}) {
  const { isAuthenticated } = useConvexAuth();
  // No display class here: each link sets its own, so "hidden on a phone" can't be overridden.
  const link = "min-h-11 items-center whitespace-nowrap rounded-full px-3 hover:text-ink";
  return (
    <header className="flex items-center justify-between gap-3 py-5">
      <Link href="/" className="inline-flex min-h-11 shrink-0 items-center" aria-label="JobPipe home">
        <Logo />
      </Link>
      <nav className="flex min-w-0 items-center gap-1 text-[15px] text-ink-2 lg:gap-2" aria-label="Main">
        <Link href="/#faq" className={`${link} hidden lg:inline-flex`}>
          FAQ
        </Link>
        <Link href="/pricing" className={`${link} hidden md:inline-flex`}>
          Pricing
        </Link>
        <Link href="/cv-review" className={`${link} hidden lg:inline-flex`}>
          Free CV review
        </Link>
        {/* On a phone the page links sit under one small menu, so FAQ and Pricing are reachable there too (28 Nov review). */}
        <details className="relative md:hidden">
          <summary aria-label="Menu" className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full hover:text-ink [&::-webkit-details-marker]:hidden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </summary>
          <div className="card absolute right-0 top-12 z-50 flex min-w-48 flex-col p-2 shadow-lg">
            <Link href="/#faq" className={`${link} inline-flex`}>
              FAQ
            </Link>
            <Link href="/pricing" className={`${link} inline-flex`}>
              Pricing
            </Link>
            <Link href="/cv-review" className={`${link} inline-flex`}>
              Free CV review
            </Link>
          </div>
        </details>
        <span className="max-sm:hidden">
          <ThemeToggle />
        </span>
        {isAuthenticated ? (
          <Link href="/" className="btn btn-secondary btn-sm">
            Open JobPipe
          </Link>
        ) : (
          <>
            {onSignIn ? (
              <button type="button" onClick={onSignIn} className={`${link} inline-flex`}>
                Sign in
              </button>
            ) : (
              <Link href="/?signin=1" className={`${link} inline-flex`}>
                Sign in
              </Link>
            )}
            {onStart ? (
              <button type="button" onClick={onStart} className="btn btn-secondary btn-sm whitespace-nowrap">
                Start free
              </button>
            ) : (
              <Link href="/" className="btn btn-secondary btn-sm whitespace-nowrap">
                Start free
              </Link>
            )}
          </>
        )}
      </nav>
    </header>
  );
}
