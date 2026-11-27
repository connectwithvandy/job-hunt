import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { PricingPlans } from "@/components/PricingPlans";
import { PLANS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free forever: daily sales jobs, a tracker, 3 fit scores a day and 1 tailored CV to try. Every AI tool: 1 month ₹699 (₹499 founding) or 3 months ₹1,499 (₹999 founding).",
  alternates: { canonical: "/pricing" },
};

export default function Pricing() {
  return (
    <LegalPage
      wide
      title="Pricing"
      lead={`Start free and stay free. Pay once for a month or three when you want every AI tool. Nothing renews by itself, and everyone gets a ${PLANS.trialDays}-day free trial of every feature first.`}
    >
      <PricingPlans />
      <div className="card flex flex-wrap items-end justify-between gap-4 p-6 text-ink">
        <div className="min-w-0">
          <h2 className="h2">Teams, communities and bootcamps</h2>
          <p className="mt-1 max-w-[60ch] text-[15px] text-ink-2">
            From {PLANS.minSeats} seats, for sales communities, bootcamps and companies supporting people after a layoff.
          </p>
        </div>
        <div className="text-right">
          <div className="display tnum text-3xl">
            ₹{PLANS.seat}
            <span className="text-[15px] text-ink-2"> / seat / month</span>
          </div>
          <a href="mailto:hello@jobpipe.in" className="btn-text inline-flex underline">
            Write to hello@jobpipe.in
          </a>
        </div>
      </div>
      <p className="text-[13px] text-ink-3">GST is added where it applies. Paid plans don&apos;t renew by themselves.</p>
    </LegalPage>
  );
}
