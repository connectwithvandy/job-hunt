import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, PLANS, missing } from "@/lib/legal";

export const metadata: Metadata = { title: "Refunds and cancellation", description: "How cancelling and refunds work for a JobPipe subscription.", alternates: { canonical: "/refunds" } };

export default function Refunds() {
  return (
    <LegalPage title="Refunds and cancellation">
      <p>Last updated {LEGAL.updated}.</p>
      <p>Everyone starts with a {PLANS.trialDays}-day free trial and then keeps a free plan, so you never pay without choosing to.</p>
      <p>Paid plans (the {PLANS.weekDays}-day Week Pass, one month, or the {PLANS.passMonths}-month pass) are one-time payments. Nothing renews or charges you again by itself. You keep every feature until the end of the time you&apos;ve paid for, then move back to the free plan. We don&apos;t refund part-used time.</p>
      <p>If you were charged by mistake (for example twice, or after cancelling), write to {missing(LEGAL.email)} within 7 days and we&apos;ll refund it in full. Refunds go back to the original payment method within 5 to 7 working days.</p>
      <p>{LEGAL.product} is a digital service: nothing is shipped.</p>
    </LegalPage>
  );
}
