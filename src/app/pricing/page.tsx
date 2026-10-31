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
        <div className="label text-accent">
          Founding members, first {PLANS.foundingSeats} people
        </div>
        <div className="display mt-2 text-4xl">
          ₹{PLANS.founding}
          <span className="text-base text-ink-2"> / month</span>
        </div>
        <p className="mt-2 text-sm text-ink-2">
          Half price, kept for as long as you stay subscribed.
        </p>
      </div>
      <div className="card p-6 text-ink">
        <div className="label">Everyone after that</div>
        <div className="display mt-2 text-4xl">
          ₹{PLANS.full}
          <span className="text-base text-ink-2"> / month</span>
        </div>
      </div>
      <div className="card p-6 text-ink">
        <div className="label text-accent">
          Job Hunt Pass, {PLANS.passMonths} months
        </div>
        <div className="display mt-2 text-4xl">
          ₹{PLANS.pass.toLocaleString("en-IN")}
          <span className="text-base text-ink-2">
            {" "}
            once (₹{PLANS.foundingPass.toLocaleString("en-IN")} for founding
            members)
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-2">
          One UPI payment that covers a typical search. No auto-renewal: when it
          ends, you choose whether to carry on.
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
