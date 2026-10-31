import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL } from "@/lib/legal";
import { ROLE_PAGES } from "@/lib/rolePages";
import { RoleLayout } from "../RoleLayout";

export const dynamicParams = false;

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
  // Questions and answers, and where this page sits, for Google and AI answer tools.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="label text-accent">Sales job guide</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{page.title}</h1>
      <p className="mt-5 text-lg text-ink-2">{page.intro}</p>
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
