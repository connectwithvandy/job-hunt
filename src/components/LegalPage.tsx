import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/** A plain public page (pricing, terms and so on), readable without signing in. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <Link href="/" className="display text-lg uppercase tracking-wide">
        {LEGAL.product}<span className="text-accent">.</span>
      </Link>
      <h1 className="display mt-8 text-4xl">{title}</h1>
      <div className="legal mt-6 space-y-4 text-sm leading-relaxed text-ink-2">{children}</div>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-xs text-ink-3">
        <Link href="/pricing">Pricing</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/refunds">Refunds and cancellation</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </div>
  );
}
