import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { PricingPlans } from "@/components/PricingPlans";
import { PLANS } from "@/lib/legal";
import { FREE } from "../../../convex/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free forever: daily sales jobs, a tracker, 5 fit scores a day and 1 tailored CV a week. Every AI tool: 1 month ₹699 (₹499 founding) or 3 months ₹1,499 (₹999 founding).",
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
      <div className="card p-6 text-ink">
        <div className="label">Free plan</div>
        <div className="display mt-2 text-4xl">₹0</div>
        <p className="mt-2 text-sm text-ink-2">
          Yours to keep after the {PLANS.trialDays}-day trial: daily sales jobs,
          your application tracker, a fit guess on every job,{" "}
          {FREE.scoresPerDay} AI fit scores a day and {FREE.tailorsPerWeek}{" "}
          tailored CV a week.
        </p>
      </div>
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
