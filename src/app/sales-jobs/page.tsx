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
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
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
