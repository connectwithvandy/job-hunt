import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CITIES } from "../../../../../convex/lib/publicRole";
import { PublicRoleList } from "@/components/PublicRoleList";
import { LEGAL } from "@/lib/legal";
import { jsonLdGraph } from "@/lib/marketing";
import { rolesAtCompany } from "@/lib/publicRoles";
import { RoleLayout } from "../../RoleLayout";

// "Rippling sales jobs India": a company's open sales roles in India and remote, from its own careers page (25 Nov 2026).
// Made when first visited, kept 6 hours. Gone (404) when the company has none open.
export const revalidate = 21600;

const month = () => new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" });

async function load(params: Promise<{ company: string }>) {
  const { company } = await params;
  const roles = await rolesAtCompany(company.slice(0, 80));
  return roles.length ? { slug: company, name: roles[0].company, roles } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ company: string }> }): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  const n = found.roles.length;
  return {
    title: { absolute: `${found.name} Sales Jobs in India: ${n} Open Role${n === 1 ? "" : "s"} (${month()})` },
    description: `${n} open sales role${n === 1 ? "" : "s"} at ${found.name} in India and remote, from ${found.name}'s own careers page: SDR, Account Executive and sales manager jobs, checked daily.`.slice(0, 160),
    alternates: { canonical: `/sales-jobs/at/${found.slug}` },
    // One role makes a thin page; its own role page already covers it.
    ...(n < 2 && { robots: { index: false, follow: true } }),
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ company: string }> }) {
  const found = await load(params);
  if (!found) notFound();
  const { name, roles, slug } = found;
  const cities = CITIES.filter((c) => roles.some((r) => r.city === c.slug));
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: LEGAL.product, item: LEGAL.site },
      { "@type": "ListItem", position: 2, name: "Sales jobs", item: `${LEGAL.site}/sales-jobs` },
      { "@type": "ListItem", position: 3, name: `${name} sales jobs`, item: `${LEGAL.site}/sales-jobs/at/${slug}` },
    ],
  };
  return (
    <RoleLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([breadcrumbs])) }} />
      <p className="label text-accent">Open sales roles</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{name} sales jobs in India</h1>
      <p className="mt-5 text-lg text-ink-2">
        {roles.length} open sales role{roles.length === 1 ? "" : "s"} at {name} in India and remote, from {name}&apos;s own careers page and checked every day.
        {cities.length > 0 && ` Based in ${cities.map((c) => (c.slug === "remote" ? "remote" : c.name)).join(", ")}.`}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          See how well your CV fits {name}&apos;s roles
        </Link>
      </div>
      <section className="mt-12">
        <h2 className="display text-2xl">Open roles at {name}</h2>
        <PublicRoleList roles={roles} showCompany={false} />
      </section>
      {cities.length > 0 && (
        <nav className="mt-12 flex flex-wrap gap-2 text-sm">
          {cities.map((c) => (
            <Link key={c.slug} href={`/sales-jobs/in/${c.slug}`} className="rounded-full border border-line px-3 py-1 hover:border-accent">
              All sales jobs {c.slug === "remote" ? "(remote)" : `in ${c.name}`}
            </Link>
          ))}
        </nav>
      )}
    </RoleLayout>
  );
}
