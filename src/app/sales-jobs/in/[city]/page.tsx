import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CITIES, FAMILIES, slugify, type Family } from "../../../../../convex/lib/publicRole";
import { PublicRoleList } from "@/components/PublicRoleList";
import { LEGAL } from "@/lib/legal";
import { jsonLdGraph } from "@/lib/marketing";
import { rolesInCity, topCompanies } from "@/lib/publicRoles";
import { RoleLayout } from "../../RoleLayout";

// "Sales jobs in Bengaluru" and the other big cities: every open sales role from company careers pages,
// grouped by kind of role, rebuilt every 6 hours (25 Nov 2026). Real counts only.
export const revalidate = 21600;
export const generateStaticParams = () => CITIES.map((c) => ({ city: c.slug }));

const PER_GROUP = 40;
const month = () => new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: slug } = await params;
  const city = CITIES.find((c) => c.slug === slug);
  if (!city) return {};
  const roles = await rolesInCity(city.slug);
  const where = city.slug === "remote" ? "Remote Sales Jobs for India" : `Sales Jobs in ${city.name}`;
  return {
    title: { absolute: `${where}: ${roles.length} Open SDR, AE & Manager Roles (${month()})` },
    description: `${roles.length} open sales roles ${city.slug === "remote" ? "open to people in India" : `in ${city.name}`} from company careers pages: SDR, BDR, Account Executive and sales manager jobs, updated every day.`.slice(0, 160),
    alternates: { canonical: `/sales-jobs/in/${city.slug}` },
    ...(roles.length < 3 && { robots: { index: false, follow: true } }),
  };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const city = CITIES.find((c) => c.slug === slug);
  if (!city) notFound();
  const roles = await rolesInCity(city.slug);
  const where = city.slug === "remote" ? "remote, open to people in India" : `in ${city.name}`;
  const top = topCompanies(roles, 8);
  const groups = (Object.keys(FAMILIES) as Family[]).map((f) => ({ family: f, roles: roles.filter((r) => r.family === f) })).filter((g) => g.roles.length);
  const faq: [string, string][] = [
    [`How many sales jobs are open ${where}?`, `${roles.length} sales roles ${where} are open on company careers pages today, counting SDR and BDR, Account Executive, account manager and sales leadership roles. The list is rebuilt every day.`],
    ...(top.length ? ([[`Which companies are hiring sales people ${where}?`, `The most open sales roles right now are at ${top.map(([c, n]) => `${c} (${n})`).join(", ")}.`]] as [string, string][]) : []),
    [`How do I apply?`, `Open a role to read it, then apply on the company's own site. JobPipe can also score each role against your CV and tailor your CV for the ones worth applying to.`],
  ];
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: LEGAL.product, item: LEGAL.site },
        { "@type": "ListItem", position: 2, name: "Sales jobs", item: `${LEGAL.site}/sales-jobs` },
        { "@type": "ListItem", position: 3, name: `Sales jobs ${where}`, item: `${LEGAL.site}/sales-jobs/in/${city.slug}` },
      ],
    },
  ];
  return (
    <RoleLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph(jsonLd)) }} />
      <p className="label text-accent">Open sales roles</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{city.slug === "remote" ? "Remote sales jobs for India" : `Sales jobs in ${city.name}`}</h1>
      <p className="mt-5 text-lg text-ink-2">
        {roles.length} sales roles {where}, straight from company careers pages and checked every day. Each one links to its own page and the company&apos;s
        application.
        {top.length > 0 && ` Most open roles right now: ${top.slice(0, 5).map(([c]) => c).join(", ")}.`}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          Get these by email every morning, scored against your CV
        </Link>
      </div>
      <nav className="mt-8 flex flex-wrap gap-2 text-sm">
        {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
          <Link key={c.slug} href={`/sales-jobs/in/${c.slug}`} className="rounded-full border border-line px-3 py-1 hover:border-accent">
            {c.slug === "remote" ? "Remote" : c.name}
          </Link>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g.family} className="mt-12">
          <h2 className="display text-2xl">
            {FAMILIES[g.family]} jobs {city.slug === "remote" ? "(remote)" : `in ${city.name}`} ({g.roles.length})
          </h2>
          <PublicRoleList roles={g.roles.slice(0, PER_GROUP)} />
          {g.roles.length > PER_GROUP && <p className="mt-2 text-sm text-ink-3">And {g.roles.length - PER_GROUP} more. JobPipe shows them all, scored against your CV.</p>}
        </section>
      ))}
      {top.length > 0 && (
        <section className="mt-12">
          <h2 className="display text-2xl">Companies hiring sales people {where}</h2>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {topCompanies(roles, 30).map(([c, n]) => (
              <li key={c}>
                <Link href={`/sales-jobs/at/${slugify(c)}`} className="rounded-full border border-line px-3 py-1 hover:border-accent">
                  {c} · {n}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-12">
        <h2 className="display text-2xl">Questions people ask</h2>
        {faq.map(([q, a]) => (
          <div key={q} className="mt-5">
            <h3 className="font-medium">{q}</h3>
            <p className="mt-1 text-ink-2">{a}</p>
          </div>
        ))}
      </section>
    </RoleLayout>
  );
}
