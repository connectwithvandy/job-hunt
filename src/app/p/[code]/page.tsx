import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cachedQuery } from "@/lib/guideRoles";
import { RememberSource } from "@/components/RememberSource";
import { RoleLayout } from "../../sales-jobs/RoleLayout";

// A job from the owner's daily LinkedIn post. The post links here instead of the company's site, so people who
// click see JobPipe, and every /p visit counts as one from LinkedIn (25 Nov 2026). Saved jobs don't change.
export const revalidate = 86400;

type PostedJob = { code: string; company: string; title: string; where: string; url: string };

const find = (code: string) => cachedQuery<PostedJob | null>("postedJobs:get", { code }).catch(() => null);

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const job = await find((await params).code);
  if (!job) return {};
  // A short link page, not a listing: kept out of search so it doesn't compete with the guide pages.
  return { title: `${job.title} at ${job.company}`, robots: { index: false, follow: true } };
}

export default async function PostedJobPage({ params }: { params: Promise<{ code: string }> }) {
  const job = await find((await params).code);
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
      <section className="card mt-10 p-6">
        <h2 className="display text-2xl">Before you apply</h2>
        <p className="mt-3 text-ink-2">
          JobPipe reads this role against your CV and tells you how well it fits, and why. Then it tailors your CV and cover letter for it, using only
          what&apos;s true, and finds who you know at {job.company} for a referral.
        </p>
        <p className="mt-3 text-ink-2">Every morning it finds new sales roles like this one from company careers pages, so you see them first.</p>
        <Link href="/" className="btn btn-primary mt-5">
          Try it free for 7 days
        </Link>
      </section>
    </RoleLayout>
  );
}
