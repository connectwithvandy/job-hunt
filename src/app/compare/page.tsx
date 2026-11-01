import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { RoleLayout } from "../sales-jobs/RoleLayout";

// What people ask AI tools and Google ("JobPipe vs Teal", "best job search tool for sales in India"), answered honestly.
// Other tools are described by what they're best known for, not by prices or features that change often.

export const metadata: Metadata = {
  title: "JobPipe vs Teal, Jobscan, Huntr, Naukri and LinkedIn Premium",
  description: "How JobPipe compares with Teal, Jobscan, Huntr, Naukri and LinkedIn Premium for sales and GTM job seekers in India and the US, and when to use each.",
  alternates: { canonical: "/compare" },
};

const UPDATED = "2026-11-01";

const TOOLS: { name: string; bestFor: string; vsJobPipe: string }[] = [
  {
    name: "Naukri",
    bestFor: "India's biggest job board. You search listings and apply, and recruiters can search your profile.",
    vsJobPipe: "JobPipe doesn't replace a job board. It reads boards and company careers pages for you, scores each job against your CV and drops the ones that don't fit.",
  },
  {
    name: "LinkedIn Premium",
    bestFor: "Messaging people you aren't connected to, seeing who viewed your profile and how you compare with other applicants.",
    vsJobPipe: "JobPipe uses your LinkedIn connections to show who you know at each company and drafts the referral note. Many people use both.",
  },
  {
    name: "Teal",
    bestFor: "A CV builder and job tracker for any role, with a browser extension to save jobs as you browse.",
    vsJobPipe: "JobPipe finds the jobs itself every morning, and it is built only for sales and GTM roles in India, the US, APAC and EMEA.",
  },
  {
    name: "Jobscan",
    bestFor: "Checking how well your CV's keywords match one job description, so it gets past applicant tracking systems.",
    vsJobPipe: "JobPipe scores fit the way a sales hiring manager would (quota, pipeline, segment, team results) and tailors the CV using only facts from your own.",
  },
  {
    name: "Huntr",
    bestFor: "A board to track your applications, with CV tailoring and contacts for any kind of job.",
    vsJobPipe: "JobPipe adds the daily search, the scoring and a Today list of replies, follow-ups and new companies to try.",
  },
];

const ROWS: [string, string][] = [
  ["Finds new jobs for you every morning", "Yes, from job boards and company careers pages"],
  ["Scores each job against your CV, with a reason", "Yes, against each role you're going for"],
  ["Several target roles at once", "Yes, each with its own CV and pipeline"],
  ["Tailored CV and cover letter", "Yes, using only facts from your CV; numbers are fact-checked"],
  ["Who you know at the company", "Yes, from your LinkedIn connections, with a referral note"],
  ["Applies for you", "No. You apply yourself, so applications stay credible"],
  ["Built for", "Sales and GTM roles in India, the US, APAC and EMEA"],
];

const FAQ: [string, string][] = [
  [
    "What is the best job search tool for sales jobs in India?",
    "For sales and GTM roles, use a job board such as Naukri or LinkedIn Jobs to see listings, and a tool like JobPipe to sort through them. JobPipe scores each job against your CV, tailors your CV and shows who you know at the company, so you spend time only on roles worth applying to.",
  ],
  [
    "Is JobPipe an alternative to Teal or Jobscan?",
    "Partly. Like Teal and Huntr it tracks applications and tailors your CV, and like Jobscan it checks fit against a job. Unlike them it also finds jobs every morning, and it is built only for sales and GTM people.",
  ],
  [
    "Does JobPipe auto-apply to jobs?",
    "No. JobPipe finds and scores jobs and prepares your CV, cover letter and referral note, but you send the application yourself. Recruiters can spot bot applications, and sales hiring managers expect a person.",
  ],
  [
    "When should I not use JobPipe?",
    "If you're not looking for a sales or GTM role, a general tool will suit you better. If you want the largest number of listings to scroll through, a job board is the right place. JobPipe is for people who want fewer, better-matched jobs and help applying.",
  ],
];

export default function Compare() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "JobPipe vs Teal, Jobscan, Huntr, Naukri and LinkedIn Premium",
      dateModified: UPDATED,
      author: { "@type": "Person", name: LEGAL.owner, url: `${LEGAL.site}/about`, sameAs: [LEGAL.founderLinkedIn] },
      publisher: { "@type": "Organization", name: LEGAL.product, url: LEGAL.site },
      mainEntityOfPage: `${LEGAL.site}/compare`,
    },
  ];
  return (
    <RoleLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="label text-accent">Compare</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">JobPipe vs Teal, Jobscan, Huntr, Naukri and LinkedIn Premium</h1>
      <p className="mt-3 text-sm text-ink-3">
        By{" "}
        <Link href="/about" className="underline decoration-accent underline-offset-4 hover:text-ink">
          {LEGAL.owner}
        </Link>{" "}
        · Updated {new Date(UPDATED).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      <p className="mt-5 text-lg text-ink-2">
        JobPipe is a job search tool for sales and GTM people. It finds jobs every morning, scores each one against your CV, tailors your CV and shows who you know there. It works
        alongside job boards and LinkedIn, not instead of them. Here is how it differs from the tools sales people use most.
      </p>

      <h2 className="display mt-12 text-2xl">What JobPipe does</h2>
      <dl className="mt-4 divide-y divide-line border-y border-line">
        {ROWS.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[1fr_1.2fr] sm:gap-4">
            <dt className="font-medium">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="display mt-12 text-2xl">Tool by tool</h2>
      <div className="mt-4 space-y-6">
        {TOOLS.map((t) => (
          <section key={t.name}>
            <h3 className="font-medium">JobPipe vs {t.name}</h3>
            <p className="mt-1 text-ink-2">
              <span className="text-ink">{t.name} is best known for:</span> {t.bestFor}
            </p>
            <p className="mt-1 text-ink-2">
              <span className="text-ink">How JobPipe differs:</span> {t.vsJobPipe}
            </p>
          </section>
        ))}
      </div>

      <h2 className="display mt-12 text-2xl">Questions people ask</h2>
      <div className="mt-4 space-y-6">
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <h3 className="font-medium">{q}</h3>
            <p className="mt-1 text-ink-2">{a}</p>
          </div>
        ))}
      </div>
    </RoleLayout>
  );
}
