import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { ROLE_PAGES } from "@/lib/rolePages";

/** The frame around the sales-jobs guides: logo, sign-up and free review buttons, links to the other guides. */
export function RoleLayout({ children, current }: { children: React.ReactNode; current?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="display text-lg uppercase tracking-wide">
          {LEGAL.product}
          <span className="text-accent">.</span>
        </Link>
        <Link href="/" className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-accent">
          Join the waitlist
        </Link>
      </header>
      <main className="mt-12">{children}</main>
      <section className="card mt-14 p-8">
        <h2 className="display text-2xl">Let JobPipe run the search for you</h2>
        <p className="mt-2 text-ink-2">
          Upload your CV and pick your roles. Every morning JobPipe finds new jobs, scores each one against your CV with a reason, tailors your CV and shows who you know there.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary">
            Join the waitlist
          </Link>
          <Link href="/cv-review" className="btn btn-ghost">
            Free CV review
          </Link>
        </div>
      </section>
      <nav className="mt-14 border-t border-line pt-6">
        <h2 className="text-sm font-medium text-ink-2">More sales job guides</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {ROLE_PAGES.filter((r) => r.slug !== current).map((r) => (
            <li key={r.slug}>
              <Link href={`/sales-jobs/${r.slug}`} className="text-ink-2 hover:text-accent">
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
