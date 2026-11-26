import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cachedQuery } from "@/lib/guideRoles";
import { RememberSource } from "@/components/RememberSource";
import { RoleLayout } from "../../sales-jobs/RoleLayout";

// The owner's daily LinkedIn post links here instead of the company's site, so people who click see JobPipe, and every
// /p visit counts as one from LinkedIn (25 Nov 2026). Two kinds of page: one job (a code of up to 7 letters/digits), or
// since 26 Nov 2026 the whole day's post (8 digits, YYYYMMDD), which is the post's only link. Saved jobs don't change.
export const revalidate = 86400;

type PostedJob = { code: string; company: string; title: string; where: string; url: string };

const isDay = (code: string) => /^\d{8}$/.test(code);
const find = (code: string) => cachedQuery<PostedJob | null>("postedJobs:get", { code }).catch(() => null);
const findDay = (day: string) => cachedQuery<PostedJob[] | null>("postedJobs:day", { day }).catch(() => null);

/** "20261126" reads "26 Nov 2026". */
function dayName(day: string) {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)));
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  // Short link pages, not listings: kept out of search so they don't compete with the guide pages.
  if (isDay(code)) {
    const jobs = await findDay(code);
    return jobs?.length ? { title: `${jobs.length} new sales jobs in India, ${dayName(code)}`, robots: { index: false, follow: true } } : {};
  }
  const job = await find(code);
  if (!job) return {};
  return { title: `${job.title} at ${job.company}`, robots: { index: false, follow: true } };
}

function Pitch({ company }: { company?: string }) {
  return (
    <section className="card mt-10 p-6">
      <h2 className="display text-2xl">Before you apply</h2>
      <p className="mt-3 text-ink-2">
        JobPipe reads {company ? "this role" : "each role"} against your CV and tells you how well it fits, and why. Then it tailors your CV and cover
        letter for it, using only what&apos;s true, and finds who you know at {company ?? "the company"} for a referral.
      </p>
      <p className="mt-3 text-ink-2">Every morning it finds new sales roles like these from company careers pages, so you see them first.</p>
      <Link href="/" className="btn btn-primary mt-5">
        Try it free for 7 days
      </Link>
    </section>
  );
}

export default async function PostedJobPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (isDay(code)) {
    const jobs = await findDay(code);
    if (!jobs?.length) notFound();
    return (
      <RoleLayout>
        <RememberSource source="linkedin-post" />
        <p className="label text-accent">New sales roles · {dayName(code)}</p>
        <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{jobs.length} new sales jobs in India</h1>
        <p className="mt-3 text-lg text-ink-2">Posted in the 24 hours before {dayName(code)}. Apply opens the original job posting.</p>
        <ul className="mt-8 space-y-4">
          {jobs.map((j) => (
            <li key={j.code} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-lg font-medium">{j.title}</p>
                <p className="text-ink-2">
                  {j.company} · {j.where}
                </p>
              </div>
              <a href={j.url} target="_blank" rel="nofollow noopener" className="btn btn-primary">
                Apply
              </a>
            </li>
          ))}
        </ul>
        <Link href="/" className="btn btn-ghost mt-6">
          See how well your CV fits these
        </Link>
        <Pitch />
      </RoleLayout>
    );
  }
  const job = await find(code);
  if (!job) notFound();
  return (
    <RoleLayout>
      <RememberSource source="linkedin-post" />
      <p className="label text-accent">New sales role</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{job.title}</h1>
      <p className="mt-3 text-lg text-ink-2">
        {job.company} · {job.where}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={job.url} target="_blank" rel="nofollow noopener" className="btn btn-primary">
          Apply on {job.company}&apos;s site
        </a>
        <Link href="/" className="btn btn-ghost">
          See how well your CV fits
        </Link>
      </div>
      <Pitch company={job.company} />
    </RoleLayout>
  );
}
