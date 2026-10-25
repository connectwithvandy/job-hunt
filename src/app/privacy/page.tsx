import { LegalPage } from "@/components/LegalPage";
import { LEGAL, missing } from "@/lib/legal";

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>Last updated {LEGAL.updated}. This explains what {LEGAL.product} keeps about you and why.</p>
      <h2 className="display text-xl text-ink">What we keep</h2>
      <p>Your email and login, the CVs you upload, the roles you pick, jobs you save and their notes, drafts we write for you, LinkedIn connections you choose to upload, and your saved form answers and writing sample.</p>
      <h2 className="display text-xl text-ink">Gmail (only if you set it up)</h2>
      <p>The optional Gmail script runs in your own Google account. It sends us only recruiting emails from the last two days (sender, subject and the start of the message) to move your applications along, and emails you a daily summary from your own Gmail. Emails that don&apos;t match a job you&apos;re applying to are thrown away.</p>
      <h2 className="display text-xl text-ink">Who handles it</h2>
      <p>Your data is stored with Convex (our database host) and the site runs on Vercel. To write drafts and scores, parts of your CV and the job posting are sent to Anthropic&apos;s Claude AI. Payments are handled by Razorpay; we never see your card or UPI details. We don&apos;t sell your data or use it for ads.</p>
      <h2 className="display text-xl text-ink">Your choices</h2>
      <p>You can edit or delete your CVs, jobs and connections at any time. To delete your whole account and its data, write to {missing(LEGAL.email)} and we&apos;ll do it within 7 days.</p>
      <h2 className="display text-xl text-ink">Contact</h2>
      <p>{missing(LEGAL.owner)}, {LEGAL.address}. {missing(LEGAL.email)}.</p>
    </LegalPage>
  );
}
