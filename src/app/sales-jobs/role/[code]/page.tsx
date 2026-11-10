import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allGuideRoles, cachedQuery, cleanDescription, roleCode, roleHref, type GuideRole } from "@/lib/guideRoles";
import { LEGAL } from "@/lib/legal";
import { jsonLdGraph } from "@/lib/marketing";
import { regionsOf } from "@/lib/regions";
import { RoleLayout } from "../../RoleLayout";

// One page per role listed on the guides. Rebuilt at most every 6 hours; a role the company takes down
// drops off the guides, so its page turns into "not found", as Google asks for expired jobs.
export const revalidate = 21600;

async function find(code: string) {
  const id = code.slice(code.lastIndexOf("-") + 1);
  const job = (await allGuideRoles()).find((j) => roleCode(j.externalId) === id);
  if (!job) return null;
  // Only the code at the end counts, so a link with an old title still finds the role; the canonical tag names one address.
  const text = await cachedQuery<{ description: string | null } | null>("careers:forJobPage", { externalId: job.externalId }).catch(() => null);
  if (!text) return null;
  return { job, description: text.description ? cleanDescription(text.description) : null };
}

/** Fully remote and open to people in India: the only kind Google lets us mark as remote. */
const remoteForIndia = (j: GuideRole) => j.workSetting === "remote" && regionsOf(j).includes("blr");

/** "Bengaluru, India · hybrid", or "Remote, open to people in India" without repeating "remote". */
const where = (j: GuideRole) => {
  if (remoteForIndia(j)) return "Remote, open to people in India";
  const place = j.location.split(";")[0].trim();
  return [place, j.workSetting && !place.toLowerCase().includes(j.workSetting.toLowerCase()) ? j.workSetting : null].filter(Boolean).join(" · ");
};

export async function generateMetadata({ params }: PageProps<"/sales-jobs/role/[code]">): Promise<Metadata> {
  const { code } = await params;
  const found = await find(code);
  if (!found) return {};
  const { job } = found;
  return {
    title: `${job.title} at ${job.company}`,
    description: `${job.title} at ${job.company}, ${where(job)}. Read the full role, apply on ${job.company}'s site, and see how well your CV fits with JobPipe.`.slice(0, 160),
    alternates: { canonical: roleHref(job) },
  };
}

export default async function RolePage({ params }: PageProps<"/sales-jobs/role/[code]">) {
  const { code } = await params;
  const found = await find(code);
  if (!found) notFound();
  const { job, description } = found;
  const remote = remoteForIndia(job);
  const posted = job.postedAt && !Number.isNaN(Date.parse(job.postedAt)) ? new Date(job.postedAt) : null;
  // Google Jobs needs the full description on the page and a posting date; without them the page is plain.
  const jobPosting =
    description && posted
      ? {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: job.title,
          description: description.replace(/\n/g, "<br>"),
          datePosted: posted.toISOString().slice(0, 10),
          hiringOrganization: { "@type": "Organization", name: job.company },
          identifier: { "@type": "PropertyValue", name: job.company, value: job.externalId },
          directApply: false,
          ...(remote
            ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "India" } }
            : { jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location.split(/[;,|]/)[0].trim(), addressCountry: regionsOf(job).includes("india") ? "IN" : undefined } } }),
        }
      : null;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: LEGAL.product, item: LEGAL.site },
      { "@type": "ListItem", position: 2, name: "Sales jobs", item: `${LEGAL.site}/sales-jobs` },
      { "@type": "ListItem", position: 3, name: `${job.title} at ${job.company}`, item: `${LEGAL.site}${roleHref(job)}` },
    ],
  };
  return (
    <RoleLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph(jobPosting ? [jobPosting, breadcrumbs] : [breadcrumbs])) }} />
      <p className="label text-accent">Open sales role</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{job.title}</h1>
      <p className="mt-3 text-lg text-ink-2">
        {job.company} · {where(job)}
      </p>
      <p className="mt-1 text-sm text-ink-3">
        {posted ? `Posted ${posted.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · ` : ""}From {job.company}&apos;s careers page, checked every morning.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          See how well your CV fits
        </Link>
        <a href={job.url} target="_blank" rel="nofollow noopener" className="btn btn-ghost">
          Apply on {job.company}&apos;s site
        </a>
      </div>
      <p className="mt-3 text-sm text-ink-3">JobPipe scores this role against your CV with a reason, tailors your CV for it and shows who you know at {job.company}. 7 days free.</p>
      <section className="mt-12">
        <h2 className="display text-2xl">About the role</h2>
        {description ? (
          <div className="mt-4 whitespace-pre-line text-ink-2">{description}</div>
        ) : (
          <p className="mt-4 text-ink-2">
            The full description is on{" "}
            <a href={job.url} target="_blank" rel="nofollow noopener" className="underline decoration-accent underline-offset-4">
              {job.company}&apos;s careers page
            </a>
            .
          </p>
        )}
      </section>
    </RoleLayout>
  );
}
