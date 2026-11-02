import type { FunctionReturnType } from "convex/server";
import { jsonLdGraph } from "@/lib/marketing";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { backOffice, titleMatches } from "../../../../convex/lib/salesRoles";
import { regionsOf } from "@/lib/regions";
import { LEGAL } from "@/lib/legal";
import { GUIDES_UPDATED, ROLE_PAGES, type RolePage } from "@/lib/rolePages";
import { RoleLayout } from "../RoleLayout";

export const dynamicParams = false;
// Rebuilt at most once a day, so the open roles stay fresh for Google without a database read per visitor.
export const revalidate = 86400;

const DAY = 86_400_000;
const AGGREGATORS = /\b(jobgether|bebee|talent\.com|jooble|careerjet)\b/i;

/** This page's open roles from company careers boards: right title, right place, posted in the last 30 days, newest first. */
async function openRoles(page: RolePage) {
  try {
    // Convex's own fetch helper opts out of caching, which would make every visit read the database; this one is cached for a day.
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "careers:forGuide", args: { titles: page.jobs.titles, india: page.jobs.india }, format: "json" }),
      next: { revalidate },
    });
    const body = (await res.json()) as { status: string; value: FunctionReturnType<typeof api.careers.forGuide> };
    if (body.status !== "success") throw new Error(`Convex said ${body.status}`);
    const rows = body.value;
    const now = Date.now();
    const seen = new Set<string>();
    return rows
      .filter((j) => page.jobs.titles.some((t) => titleMatches(t, j.title)) && !backOffice(j.title) && !page.jobs.exclude?.test(j.title))
      // Job aggregators that run their own careers board aren't the employer; jobs link to the company itself.
      .filter((j) => !AGGREGATORS.test(j.company))
      .filter((j) => regionsOf(j).some((r) => page.jobs.regions.includes(r)))
      .filter((j) => !j.postedAt || now - Date.parse(j.postedAt) < 30 * DAY)
      // The same role posted in several cities shows once.
      .filter((j) => !seen.has(`${j.company}|${j.title}`) && !!seen.add(`${j.company}|${j.title}`))
      .sort((a, b) => (Date.parse(b.postedAt ?? "") || 0) - (Date.parse(a.postedAt ?? "") || 0))
      .slice(0, 15);
  } catch (err) {
    // A failed read leaves the guide as it is; the list comes back on the next rebuild.
    console.warn("Guide roles failed", err);
    return [];
  }
}

export function generateStaticParams() {
  return ROLE_PAGES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: PageProps<"/sales-jobs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = ROLE_PAGES.find((r) => r.slug === slug);
  if (!page) return {};
  return { title: page.title, description: page.description, alternates: { canonical: `/sales-jobs/${page.slug}` } };
}

export default async function RoleGuide({ params }: PageProps<"/sales-jobs/[slug]">) {
  const { slug } = await params;
  const page = ROLE_PAGES.find((r) => r.slug === slug);
  if (!page) notFound();
  const roles = await openRoles(page);
  // Questions and answers, and where this page sits, for Google and AI answer tools.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.title,
      description: page.description,
      dateModified: GUIDES_UPDATED,
      author: { "@type": "Person", name: LEGAL.owner, url: `${LEGAL.site}/about`, sameAs: [LEGAL.founderLinkedIn] },
      publisher: { "@type": "Organization", name: LEGAL.product, url: LEGAL.site },
      mainEntityOfPage: `${LEGAL.site}/sales-jobs/${page.slug}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: LEGAL.product, item: LEGAL.site },
        { "@type": "ListItem", position: 2, name: "Sales jobs", item: `${LEGAL.site}/sales-jobs` },
        { "@type": "ListItem", position: 3, name: page.title, item: `${LEGAL.site}/sales-jobs/${page.slug}` },
      ],
    },
  ];
  return (
    <RoleLayout current={page.slug}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph(jsonLd)) }} />
      <p className="label text-accent">Sales job guide</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{page.title}</h1>
      <p className="mt-3 text-sm text-ink-3">
        By{" "}
        <Link href="/about" className="underline decoration-accent underline-offset-4 hover:text-ink">
          {LEGAL.owner}
        </Link>
        , sales development leader · Updated {new Date(GUIDES_UPDATED).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      <p className="mt-5 text-lg text-ink-2">{page.intro}</p>
      {roles.length > 0 && (
        <section className="mt-12">
          <h2 className="display text-2xl">Open roles right now</h2>
          <p className="mt-1 text-sm text-ink-3">
            From company careers pages, checked every morning. Updated {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {roles.map((j) => (
              <li key={j.url}>
                <a href={j.url} target="_blank" rel="nofollow noopener" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 hover:text-accent">
                  <span className="font-medium">
                    {j.title} <span className="font-normal text-ink-2">at {j.company}</span>
                  </span>
                  <span className="text-sm text-ink-3">{[j.location.split(";")[0], j.workSetting].filter(Boolean).join(" · ")}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2">JobPipe scores roles like these against your CV every morning and tailors your CV for the ones worth applying to.</p>
        </section>
      )}
      <h2 className="display mt-12 text-2xl">What hiring managers look for</h2>
      <ul className="mt-4 space-y-3 text-ink-2">
        {page.looksFor.map((l) => (
          <li key={l} className="border-l-2 border-accent pl-4">
            {l}
          </li>
        ))}
      </ul>
      <h2 className="display mt-12 text-2xl">Questions people ask</h2>
      <div className="mt-4 space-y-6">
        {page.faq.map(([q, a]) => (
          <div key={q}>
            <h3 className="font-medium">{q}</h3>
            <p className="mt-1 text-ink-2">{a}</p>
          </div>
        ))}
      </div>
    </RoleLayout>
  );
}
