import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_PAGES } from "@/lib/rolePages";
import { RoleLayout } from "./RoleLayout";

export const metadata: Metadata = {
  title: "Sales and GTM job guides for India, the US, APAC and EMEA",
  description: "Guides to SDR, BDR, Account Executive, sales leadership, GTM and remote sales jobs in India and the US: what hiring managers look for, and how to land one.",
  alternates: { canonical: "/sales-jobs" },
};

export default function SalesJobs() {
  return (
    <RoleLayout>
      <p className="label text-accent">Sales job guides</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">Sales and GTM jobs in India, the US, APAC and EMEA</h1>
      <p className="mt-5 text-lg text-ink-2">What each role is, what hiring managers look for, and how to find the openings worth your time.</p>
      <Link href="/sales-jobs/india-sales-hiring-index" className="card mt-10 block border-accent/40 p-6 transition-colors hover:border-accent">
        <p className="label text-accent">Updated every Monday</p>
        <h2 className="mt-1 text-lg font-medium">India Sales Hiring Index</h2>
        <p className="mt-2 text-sm text-ink-2">Open sales roles by type and city, who&apos;s hiring SDRs and AEs in Bengaluru, and roles posted again after closing.</p>
      </Link>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {ROLE_PAGES.map((r) => (
          <li key={r.slug}>
            <Link href={`/sales-jobs/${r.slug}`} className="card block h-full p-6 transition-colors hover:border-accent/40">
              <h2 className="font-medium">{r.title}</h2>
              <p className="mt-2 text-sm text-ink-2">{r.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </RoleLayout>
  );
}
