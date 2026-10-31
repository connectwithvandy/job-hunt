import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { PLANS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Everything included: job search, fit scores, tailored CVs, referral notes and interview prep. 7-day free trial, then ₹999/month or ₹2,499 for 3 months.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing() {
  return (
    <LegalPage title="Pricing">
      <p>
        Every plan includes everything: job search across boards and company
        careers pages, fit scores for every role you want, tailored CVs and
        cover letters, referral and hiring-manager messages, interview prep and
        the morning summary.
      </p>
      <div className="card p-6 text-ink">
        <div className="label">Monthly</div>
        <Price now={PLANS.founding} was={PLANS.full} unit="/ month" />
        <p className="mt-2 text-sm text-ink-2">
          Founding offer: half price for the first {PLANS.foundingSeats} people,
          kept for as long as you stay. ₹{PLANS.full} a month after that.
        </p>
      </div>
      <div className="card p-6 text-ink">
        <div className="label">Job Hunt Pass, {PLANS.passMonths} months</div>
        <Price now={PLANS.foundingPass} was={PLANS.pass} unit="once" />
        <p className="mt-2 text-sm text-ink-2">
          One payment that covers a typical search, with no auto-renewal. ₹
          {PLANS.pass.toLocaleString("en-IN")} after the founding offer, already
          less than {PLANS.passMonths} months at ₹{PLANS.full}.
        </p>
      </div>
      <div className="card p-6 text-ink">
        <div className="label">Teams, communities and bootcamps</div>
        <div className="display mt-2 text-4xl">
          ₹{PLANS.seat}
          <span className="text-base text-ink-2"> / seat / month</span>
        </div>
        <p className="mt-2 text-sm text-ink-2">
          From {PLANS.minSeats} seats, for sales communities, bootcamps and
          companies supporting people after a layoff. Write to hello@jobpipe.in.
        </p>
      </div>
      <p>
        Every plan starts with a {PLANS.trialDays}-day free trial. Prices
        include all features; GST is added where it applies. Cancel anytime.
      </p>
    </LegalPage>
  );
}

/** A price as a discount off the one real price: the full price struck through, then the offer. */
function Price({ now, was, unit }: { now: number; was: number; unit: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
      <s className="text-xl text-ink-3">₹{was.toLocaleString("en-IN")}</s>
      <span className="display text-4xl">₹{now.toLocaleString("en-IN")}</span>
      <span className="text-base text-ink-2">{unit}</span>
      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
        {Math.round((1 - now / was) * 100)}% off
      </span>
    </div>
  );
}
