import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";

/**
 * A plain public page (pricing, terms and so on), readable without signing in. It carries the public menu, so no page
 * is a dead end. `wide` gives room for side-by-side content such as the plan cards.
 */
export function LegalPage({ title, lead, wide, children }: { title: string; lead?: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`mx-auto px-5 pb-12 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
      <PublicHeader />
      <h1 className="display mt-6 text-4xl">{title}</h1>
      {lead && <p className="mt-3 max-w-[68ch] text-[17px] leading-relaxed text-ink-2">{lead}</p>}
      <div className="legal mt-6 space-y-4 text-sm leading-relaxed text-ink-2">{children}</div>
      <nav className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-ink-3">
        <Link href="/" className="inline-flex min-h-11 items-center">
          Home
        </Link>
        <Link href="/pricing" className="inline-flex min-h-11 items-center">
          Pricing
        </Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center">
          Terms
        </Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center">
          Privacy
        </Link>
        <Link href="/refunds" className="inline-flex min-h-11 items-center">
          Refunds and cancellation
        </Link>
        <Link href="/contact" className="inline-flex min-h-11 items-center">
          Contact
        </Link>
      </nav>
    </div>
  );
}
