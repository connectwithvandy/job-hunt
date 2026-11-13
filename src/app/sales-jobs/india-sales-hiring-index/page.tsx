import type { Metadata } from "next";
import { cachedQuery } from "@/lib/guideRoles";
import { jsonLdGraph } from "@/lib/marketing";
import { LEGAL } from "@/lib/legal";
import type { HiringIndex } from "../../../../convex/lib/hiringIndex";
import { RoleLayout } from "../RoleLayout";

// The snapshot changes on Mondays; a few rebuilds a day pick it up soon after.
export const revalidate = 21600;

const PATH = "/sales-jobs/india-sales-hiring-index";

export const metadata: Metadata = {
  title: "India Sales Hiring Index: who's hiring SDRs, AEs and sales leaders this week",
  description:
    "Every week: open sales roles in India by role and city, the companies hiring most, who's hiring SDRs and Account Executives in Bengaluru, roles posted again after closing, and salaries where listed. From company careers pages.",
  alternates: { canonical: PATH },
};

type Latest = { week: string; builtAt: number; data: string; previous: string | null } | null;

const n = (x: number) => x.toLocaleString("en-IN");

/** "+12 on last week", or nothing when there's no last week to compare with. */
function change(now: number, before?: number) {
  if (before === undefined) return null;
  const d = now - before;
  return <span className={`ml-2 text-sm ${d >= 0 ? "text-good" : "text-bad"}`}>{d === 0 ? "same as last week" : `${d > 0 ? "+" : ""}${n(d)} on last week`}</span>;
}

/** A row with a bar sized against the biggest in its list. */
function Bar({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 py-1.5 text-sm sm:grid-cols-[14rem_1fr_auto]">
      <span className="truncate">{label}</span>
      <span className="h-2 rounded-full bg-soft">
        <span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round((value / Math.max(1, max)) * 100))}%` }} />
      </span>
      <span className="tabular-nums text-ink-2">
        {n(value)}
        {note && <span className="ml-1 text-xs text-ink-3">{note}</span>}
      </span>
    </li>
  );
}

export default async function HiringIndexPage() {
  const latest = await cachedQuery<Latest>("hiringIndex:latest", {}).catch(() => null);
  if (!latest) {
    return (
      <RoleLayout current="india-sales-hiring-index">
        <h1 className="display text-4xl">India Sales Hiring Index</h1>
        <p className="mt-4 text-ink-2">The first edition is being put together. Check back on Monday.</p>
      </RoleLayout>
    );
  }
  const x = JSON.parse(latest.data) as HiringIndex;
  const prev = latest.previous ? (JSON.parse(latest.previous) as HiringIndex) : null;
  const weekLabel = new Date(`${latest.week}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const maxFamily = Math.max(...x.families.map((f) => f.open));
  const maxCity = Math.max(...x.cities.map((c) => c.open));
  const maxCompany = Math.max(...x.topCompanies.map((c) => c.open));
  const dataset = {
    "@type": "Dataset",
    name: "India Sales Hiring Index",
    description: "Weekly counts of open sales roles in India from company careers pages, by role, city and company.",
    url: `${LEGAL.site}${PATH}`,
    dateModified: new Date(latest.builtAt).toISOString(),
    creator: { "@type": "Organization", name: LEGAL.product, url: LEGAL.site },
    isAccessibleForFree: true,
  };

  return (
    <RoleLayout current="india-sales-hiring-index">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([dataset])) }} />
      <p className="label text-accent">Week of {weekLabel}</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">India Sales Hiring Index</h1>
      <p className="mt-4 text-lg text-ink-2">
        Who is hiring sales people in India this week, counted from company careers pages we read every day. Updated every Monday.
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="label">Open sales roles</div>
          <div className="display mt-2 text-4xl">{n(x.totals.open)}</div>
          {change(x.totals.open, prev?.totals.open)}
        </div>
        <div className="card p-5">
          <div className="label">New this week</div>
          <div className="display mt-2 text-4xl">{n(x.totals.newWeek)}</div>
          {change(x.totals.newWeek, prev?.totals.newWeek)}
        </div>
        <div className="card p-5">
          <div className="label">Companies hiring</div>
          <div className="display mt-2 text-4xl">{n(x.totals.companies)}</div>
          {change(x.totals.companies, prev?.totals.companies)}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="display text-2xl">Open roles by type</h2>
        <ul className="mt-4">
          {x.families.map((f) => (
            <Bar key={f.name} label={f.name} value={f.open} max={maxFamily} note={f.newWeek ? `${n(f.newWeek)} new` : undefined} />
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="display text-2xl">Open roles by city</h2>
        <p className="mt-1 text-sm text-ink-3">A role open in several cities counts in each. Remote means remote and open to India.</p>
        <ul className="mt-4">
          {x.cities.map((c) => (
            <Bar key={c.city} label={c.city} value={c.open} max={maxCity} note={c.newWeek ? `${n(c.newWeek)} new` : undefined} />
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="display text-2xl">Companies hiring the most sales people</h2>
        <p className="mt-1 text-sm text-ink-3">By different sales roles open, not postings: one role listed in five cities counts once.</p>
        <ul className="mt-4">
          {x.topCompanies.map((c) => (
            <Bar key={c.company} label={c.company} value={c.open} max={maxCompany} />
          ))}
        </ul>
      </section>

      <section className="mt-12 grid gap-6 md:grid-cols-2">
        {x.bengaluru.map((b) => (
          <div key={b.family} className="card p-5">
            <h2 className="text-lg font-medium">Hiring {b.family === "SDR / BDR" ? "SDRs and BDRs" : "Account Executives"} in Bengaluru</h2>
            {b.companies.length ? (
              <ol className="mt-3 space-y-1.5 text-sm">
                {b.companies.map((c) => (
                  <li key={c.company} className="flex justify-between gap-3">
                    <span className="truncate">{c.company}</span>
                    <span className="text-ink-3">
                      {c.open} {c.open === 1 ? "role" : "roles"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-ink-3">None open this week.</p>
            )}
          </div>
        ))}
      </section>

      {x.reposted.length > 0 && (
        <section className="mt-12">
          <h2 className="display text-2xl">Roles posted again after closing</h2>
          <p className="mt-1 text-sm text-ink-3">Taken down and put back up. Often a role that&apos;s hard to fill, which can mean room to talk.</p>
          <ul className="mt-4 divide-y divide-line text-sm">
            {x.reposted.map((r) => (
              <li key={`${r.company}-${r.title}`} className="flex justify-between gap-3 py-2">
                <span>
                  {r.title} <span className="text-ink-3">· {r.company}</span>
                </span>
                <span className="shrink-0 text-ink-3">{r.reposts === 1 ? "posted again once" : `posted again ${r.reposts} times`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="display text-2xl">Newest sales roles</h2>
        <ul className="mt-4 divide-y divide-line text-sm">
          {x.newest.map((r) => (
            <li key={r.url} className="py-2">
              <a href={r.url} target="_blank" rel="nofollow noopener" className="font-medium hover:text-accent">
                {r.title}
              </a>
              <span className="text-ink-3">
                {" "}
                · {r.company} · {r.location}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {x.salaries.length > 0 && (
        <section className="mt-12">
          <h2 className="display text-2xl">Pay, where the company lists it</h2>
          <p className="mt-1 text-sm text-ink-3">
            Only {n(x.totals.withSalary)} of {n(x.totals.open)} roles list pay. The latest:
          </p>
          <ul className="mt-4 divide-y divide-line text-sm">
            {x.salaries.map((r) => (
              <li key={`${r.company}-${r.title}-${r.salary}`} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {r.title} <span className="text-ink-3">· {r.company}</span>
                </span>
                <span className="text-ink-2">{r.salary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-12 text-sm text-ink-3">
        How it&apos;s counted: sales and go-to-market roles open on employers&apos; own careers pages, in India or remote and open to India. Recruitment agencies and job boards are left out.
        Feel free to quote these numbers with a link to this page.
      </p>
    </RoleLayout>
  );
}
