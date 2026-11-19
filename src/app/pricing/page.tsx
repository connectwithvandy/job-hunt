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
    <LegalPage title="Pricing">
      <p>
        Every paid plan includes everything: job search across boards and
        company careers pages, fit scores for every role you want, tailored CVs
        and cover letters, referral and hiring-manager messages, interview prep
        and the morning summary.
      </p>
      <PricingPlans />
      <div className="card p-6 text-ink">
        <div className="label">Teams, communities and bootcamps</div>
        <div className="display mt-2 text-4xl">
          ₹{PLANS.seat}
          <span className="text-base text-ink-2"> / seat / month</span>
        </div>
        <p className="mt-2 text-sm text-ink-2">
          From {PLANS.minSeats} seats, for sales communities, bootcamps and
          companies supporting people after a layoff. Write to vandana@jobpipe.in.
        </p>
      </div>
      <p>
        Everyone starts with a {PLANS.trialDays}-day free trial of every
        feature, then keeps the free plan. Paid plans don&apos;t renew by
        themselves; GST is added where it applies.
      </p>
    </LegalPage>
  );
}
