import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { RoleLayout } from "../sales-jobs/RoleLayout";

// Who is behind JobPipe. Search engines and AI answer tools trust advice more when a named person with real experience stands behind it.
// Only facts from the founder's own CV; no employer names, and no claim of managing managers.

export const metadata: Metadata = {
  title: "About JobPipe and its founder, Vandana Agarwal",
  description: "JobPipe was built by Vandana Agarwal, a sales development leader in Bengaluru with 7+ years building SDR and BDR teams across APAC, EMEA and North America.",
  alternates: { canonical: "/about" },
};

export default function About() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: LEGAL.owner,
      alternateName: LEGAL.founder,
      jobTitle: "Sales development leader",
      homeLocation: { "@type": "Place", name: "Bengaluru, India" },
      url: `${LEGAL.site}/about`,
      sameAs: [LEGAL.founderLinkedIn],
      knowsAbout: ["Sales development", "SDR and BDR hiring", "Sales coaching", "B2B SaaS sales", "Go-to-market"],
    },
  };
  return (
    <RoleLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="label text-accent">About</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">Built by a sales leader, during a real job hunt</h1>
      <div className="mt-6 space-y-5 text-lg text-ink-2">
        <p>
          I&apos;m {LEGAL.owner} ({LEGAL.founder}). I&apos;ve spent 7+ years in sales development, building and leading SDR and BDR teams that sell into APAC, EMEA and North
          America for SaaS and cybersecurity companies. Along the way I&apos;ve hired and ramped more than 25 BDRs, and I started SDR Leaders of APAC, a peer community of
          250+ sales development managers.
        </p>
        <p>
          When I started looking for my next role, I noticed sales people don&apos;t look for one job. We run several searches at once: SDR manager here, head of sales
          development there, a GTM role worth a shot. Each needs a different CV, and the good roles are spread across job boards, careers pages and people we already know.
        </p>
        <p>
          I wanted a tool that read the jobs for me every morning, told me honestly which ones fit and why, tailored my CV without inventing numbers, and reminded me who
          could refer me. I couldn&apos;t find one built for sales, so I built {LEGAL.product}.
        </p>
      </div>

      <h2 className="display mt-12 text-2xl">What {LEGAL.product} stands for</h2>
      <ul className="mt-4 space-y-3 text-ink-2">
        <li className="border-l-2 border-accent pl-4">Your CV stays true. Tailoring reorders and trims your real facts; it never adds experience you don&apos;t have.</li>
        <li className="border-l-2 border-accent pl-4">You apply yourself. No bot applications, because hiring managers can tell.</li>
        <li className="border-l-2 border-accent pl-4">Judged the way sales leaders hire: quota, pipeline, deal size, segment and team results.</li>
        <li className="border-l-2 border-accent pl-4">Your data runs your search and nothing else. It is never sold or used for ads.</li>
      </ul>

      <p className="mt-10 text-ink-2">
        Questions, ideas or a role you think I should add? Write to{" "}
        <a href={`mailto:${LEGAL.email}`} className="text-ink underline decoration-accent underline-offset-4">
          {LEGAL.email}
        </a>{" "}
        or find me on{" "}
        <a href={LEGAL.founderLinkedIn} target="_blank" rel="noreferrer" className="text-ink underline decoration-accent underline-offset-4">
          LinkedIn
        </a>
        .
      </p>
    </RoleLayout>
  );
}
