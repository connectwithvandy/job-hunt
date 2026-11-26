import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cachedQuery } from "@/lib/guideRoles";
import { RememberSource } from "@/components/RememberSource";
import { ApplyLink, CountVisit } from "@/components/PostCount";
import { RoleLayout } from "../../sales-jobs/RoleLayout";

// The owner's daily LinkedIn post links here instead of the company's site, so people who click see JobPipe, and every
// /p visit counts as one from LinkedIn (25 Nov 2026). Two kinds of page: one job (a code of up to 7 letters/digits), or
// since 26 Nov 2026 the whole day's post (8 digits, YYYYMMDD), which is the post's only link. Saved jobs don't change.
// Apply goes through /apply/CODE, which asks people to sign up before it opens the job (owner, 26 Nov 2026).
export const revalidate = 86400;

type PostedJob = { code: string; company: string; title: string; where: string; url: string; line?: string };

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
        <CountVisit code={code} />
        <p className="label text-accent">Found via JobPipe · {dayName(code)}</p>
        <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{jobs.length} new sales jobs in India</h1>
        <p className="mt-3 text-lg text-ink-2">Don&apos;t apply blind. Check how well your CV fits each role first.</p>
        <ul className="mt-8 space-y-4">
          {jobs.map((j) => (
            <li key={j.code} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-lg font-medium">{j.title}</p>
                <p className="text-ink-2">
                  {j.company} · {j.where}
                </p>
                {j.line && <p className="mt-1 text-sm text-ink-2">{j.line}</p>}
              </div>
              <ApplyLink code={j.code} className="btn btn-primary">
                Check fit and apply
              </ApplyLink>
            </li>
          ))}
        </ul>
        <Pitch />
      </RoleLayout>
    );
  }
  const job = await find(code);
  if (!job) notFound();
  return (
    <RoleLayout>
      <RememberSource source="linkedin-post" />
      <CountVisit code={job.code} />
      <p className="label text-accent">Found via JobPipe · new in the last 24 hours</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{job.title}</h1>
      <p className="mt-3 text-lg text-ink-2">
        {job.company} · {job.where}
      </p>
      {job.line && <p className="mt-4 text-lg">{job.line}</p>}
      <div className="card mt-6 p-5">
        <p className="font-medium">Don&apos;t apply blind. See how well your CV fits this role first.</p>
        <ApplyLink code={job.code} className="btn btn-primary mt-4">
          Check my fit and apply
        </ApplyLink>
      </div>
      <Pitch company={job.company} />
    </RoleLayout>
  );
}
