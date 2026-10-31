import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, PLANS, missing } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service", description: "The terms for using JobPipe.", alternates: { canonical: "/terms" } };

export default function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>Last updated {LEGAL.updated}. {LEGAL.product} is run by {missing(LEGAL.owner)}, {LEGAL.address}. By using {LEGAL.product} you agree to these terms.</p>
      <h2 className="display text-xl text-ink">What {LEGAL.product} does</h2>
      <p>{LEGAL.product} helps you search for jobs, scores how well they fit you, and drafts CVs, cover letters and messages for you to review. You decide what to send and where to apply. {LEGAL.product} never applies or sends messages on your behalf without you pressing the button.</p>
      <h2 className="display text-xl text-ink">Your account</h2>
      <p>You need an account, and access is given from a waitlist. Keep your login private. You are responsible for what you send using drafts from {LEGAL.product}; check every CV, letter and message before you use it.</p>
      <h2 className="display text-xl text-ink">AI drafts</h2>
      <p>Drafts are written by AI from your own CV and the job posting. We instruct it to use only facts from your CV and flag numbers that don&apos;t match, but it can still make mistakes. Fit scores and pay estimates are guidance, not promises.</p>
      <h2 className="display text-xl text-ink">Payments</h2>
      <p>Paid plans are billed monthly in Indian rupees after a {PLANS.trialDays}-day free trial. Daily limits on AI features keep the service fair for everyone. See the refund and cancellation policy for how cancelling works.</p>
      <h2 className="display text-xl text-ink">Fair use</h2>
      <p>Don&apos;t misuse the service: no scraping, reselling access, sending spam with it, or trying to get around the daily limits. We may suspend accounts that do.</p>
      <h2 className="display text-xl text-ink">Changes and contact</h2>
      <p>We may update these terms and will show the new date here. Questions: {missing(LEGAL.email)}.</p>
    </LegalPage>
  );
}
