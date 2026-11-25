import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { jsonLdGraph } from "@/lib/marketing";
import { RoleLayout } from "../../sales-jobs/RoleLayout";
import { OteCalculator } from "./OteCalculator";

// A free tool sales people search for and share: what an OTE offer really pays (25 Nov 2026). Runs in the browser, no AI.

const FAQ: [string, string][] = [
  ["What is OTE in sales?", "On-target earnings: fixed pay plus the variable pay you earn at 100% of your target. It is the number most sales offers lead with, but you only earn all of it if you hit target."],
  ["How do I compare two sales offers?", "Compare what each is likely to pay, not the OTE. Multiply the variable part by the share of target the team really hits, add the fixed pay, and compare that. A lower OTE with more fixed pay can be the better offer."],
  ["What is a good fixed to variable split for an SDR or AE?", "SDR offers are often weighted towards fixed pay, and Account Executive offers carry a bigger variable share tied to closed revenue. The right split depends on how achievable the target is, so ask how many people on the team hit it last quarter."],
  ["What should I ask before accepting an OTE offer?", "Ask for the fixed and variable split, how the target is set and measured, what share of the team hit it last quarter, how often variable is paid, whether commission is capped, and how long the ramp is."],
];

export const metadata: Metadata = {
  title: { absolute: "Sales OTE Calculator: What Will an SDR or AE Offer Really Pay?" },
  description: "Free OTE calculator for sales offers: enter fixed pay, variable pay and how often the team hits target, and compare two SDR or AE offers side by side.",
  alternates: { canonical: "/tools/ote-calculator" },
};

export default function OtePage() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "WebApplication", name: "Sales OTE calculator", url: `${LEGAL.site}/tools/ote-calculator`, applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
  ];
  return (
    <RoleLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph(jsonLd)) }} />
      <p className="label text-accent">Free tool</p>
      <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">Sales OTE calculator</h1>
      <p className="mt-5 text-lg text-ink-2">
        An offer&apos;s OTE assumes you hit 100% of target. Put in the fixed pay, the variable pay and how often the team really hits target, and see what each offer is likely to pay.
      </p>
      <OteCalculator />
      <p className="mt-6 text-sm text-ink-2">
        Looking at SDR or AE roles?{" "}
        <Link href="/sales-jobs/sdr-salary-india" className="underline decoration-accent underline-offset-4">
          SDR salary in India
        </Link>{" "}
        ·{" "}
        <Link href="/sales-jobs/account-executive-salary-india" className="underline decoration-accent underline-offset-4">
          Account Executive salary in India
        </Link>
      </p>
      <section className="mt-12">
        <h2 className="display text-2xl">Questions people ask</h2>
        {FAQ.map(([q, a]) => (
          <div key={q} className="mt-5">
            <h3 className="font-medium">{q}</h3>
            <p className="mt-1 text-ink-2">{a}</p>
          </div>
        ))}
      </section>
    </RoleLayout>
  );
}
