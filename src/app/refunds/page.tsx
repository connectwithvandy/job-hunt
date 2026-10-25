import { LegalPage } from "@/components/LegalPage";
import { LEGAL, PLANS, missing } from "@/lib/legal";

export default function Refunds() {
  return (
    <LegalPage title="Refunds and cancellation">
      <p>Last updated {LEGAL.updated}.</p>
      <p>Every plan starts with a {PLANS.trialDays}-day free trial. Cancel during the trial and you pay nothing.</p>
      <p>After the trial you&apos;re billed monthly. You can cancel anytime; you keep access until the end of the month you&apos;ve paid for, and you won&apos;t be charged again. We don&apos;t refund part-used months.</p>
      <p>If you were charged by mistake (for example twice, or after cancelling), write to {missing(LEGAL.email)} within 7 days and we&apos;ll refund it in full. Refunds go back to the original payment method within 5 to 7 working days.</p>
      <p>{LEGAL.product} is a digital service: nothing is shipped.</p>
    </LegalPage>
  );
}
