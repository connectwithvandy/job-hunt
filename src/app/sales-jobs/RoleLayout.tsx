import Link from "next/link";
import { ROLE_PAGES } from "@/lib/rolePages";
import { JobsByEmail } from "@/components/JobsByEmail";
import { CITIES } from "../../../convex/lib/publicRole";
import { PublicHeader } from "@/components/PublicHeader";

/** The frame around the sales-jobs guides: logo, sign-up and free review buttons, links to the other guides. */
export function RoleLayout({ children, current }: { children: React.ReactNode; current?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-10">
      <PublicHeader />
      <main className="mt-8">{children}</main>
      <div className="mt-14">
        <JobsByEmail />
      </div>
      <section className="card mt-6 p-8">
        <h2 className="display text-2xl">Let JobPipe run the search for you</h2>
        <p className="mt-2 text-ink-2">
          Upload your CV and pick your roles. Every morning JobPipe finds new jobs, scores each one against your CV with a reason, tailors your CV and helps you find who you know there.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary">
            Start your free trial
          </Link>
          <Link href="/cv-review" className="btn btn-ghost">
            Free CV review
          </Link>
        </div>
      </section>
      <nav className="mt-14 border-t border-line pt-6">
        <h2 className="text-sm font-medium text-ink-2">Sales jobs by city</h2>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {CITIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/sales-jobs/in/${c.slug}`} className="text-ink-2 hover:text-accent">
                {c.slug === "remote" ? "Remote sales jobs for India" : `Sales jobs in ${c.name}`}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-6 text-sm">
        <Link href="/tools/ote-calculator" className="font-medium text-accent hover:underline">
          Free tool: what will a sales offer really pay? (OTE calculator)
        </Link>
        <span className="text-ink-3"> · </span>
        <a href="https://github.com/connectwithvandy/job-hunt" target="_blank" rel="noreferrer" className="text-ink-2 hover:text-accent">
          JobPipe is open source: ⭐ star it on GitHub
        </a>
      </p>
      <nav className="mt-8">
        <h2 className="text-sm font-medium text-ink-2">More sales job guides</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {current !== "india-sales-hiring-index" && (
            <li>
              <Link href="/sales-jobs/india-sales-hiring-index" className="font-medium text-accent hover:underline">
                India Sales Hiring Index: this week
              </Link>
            </li>
          )}
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
