import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { PLANS } from "@/lib/legal";

export const metadata: Metadata = { title: "Pricing", description: "One plan with everything: job search, fit scores, tailored CVs, referral notes and interview prep. 7-day free trial; founding members ₹499 a month.", alternates: { canonical: "/pricing" } };

export default function Pricing() {
  return (
    <LegalPage title="Pricing">
      <p>One plan, everything included: job search across boards and company careers pages, fit scores for every role you want, tailored CVs and cover letters, referral and hiring-manager messages, interview prep and the morning summary.</p>
      <div className="card p-6 text-ink">
        <div className="label text-accent">Founding members, first {PLANS.foundingSeats} people</div>
        <div className="display mt-2 text-4xl">₹{PLANS.founding}<span className="text-base text-ink-2"> / month</span></div>
        <p className="mt-2 text-sm text-ink-2">Half price, kept for as long as you stay subscribed.</p>
      </div>
      <div className="card p-6 text-ink">
        <div className="label">Everyone after that</div>
        <div className="display mt-2 text-4xl">₹{PLANS.full}<span className="text-base text-ink-2"> / month</span></div>
      </div>
      <p>Every plan starts with a {PLANS.trialDays}-day free trial. Prices include all features; GST is added where it applies. Cancel anytime.</p>
    </LegalPage>
  );
}
