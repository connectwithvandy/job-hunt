import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, missing } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy", description: "What JobPipe stores, why, and how Gmail and Calendar access is used under Google's Limited Use rules.", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>Last updated {LEGAL.updated}. This explains what {LEGAL.product} keeps about you and why.</p>
      <h2 className="display text-xl text-ink">What we keep</h2>
      <p>Your email and login, the CVs you upload, the roles you pick, jobs you save and their notes, drafts we write for you, LinkedIn connections you choose to upload, and your saved form answers and writing sample.</p>
      <h2 className="display text-xl text-ink">Gmail and Google Calendar (only if you connect them)</h2>
      <p>
        Connecting Gmail is optional. When you click Connect Gmail, you give {LEGAL.product} read-only access to your Gmail
        (gmail.readonly) and Google Calendar (calendar.readonly). We can&apos;t send, delete or change anything in your account.
      </p>
      <p>
        <b>What we read.</b> Once an hour we search your Gmail for recruiting emails from the last two days (emails mentioning applications, interviews,
        offers, rejections or recruiters, and LinkedIn message alerts). For those emails we read the sender, subject, date and the first part of the
        message. We also read your calendar from yesterday to three weeks ahead: each meeting&apos;s title, time, guests&apos; email addresses, notes and
        meeting link.
      </p>
      <p>
        <b>How we use it.</b> Only to keep your job search up to date: an email or meeting about a job you&apos;re applying to moves that job to its next
        stage and shows on your Today page. A recruiting email about a role you don&apos;t have in {LEGAL.product} yet is read by Anthropic&apos;s Claude AI
        to find the company and role, and added as a job. Nothing else.
      </p>
      <p>
        <b>What we keep.</b> For emails and meetings that match one of your jobs, we keep the sender, subject, date, the first part of the message and the
        meeting details, attached to that job. Everything else is thrown away straight after it&apos;s checked; we keep only each email&apos;s ID so it
        isn&apos;t read twice. Your Google permission is stored encrypted.
      </p>
      <p>
        <b>What we never do.</b> We don&apos;t sell Google data, use it for ads, share it with anyone other than the services named below to run the
        features above, use it to train AI models, or let people read it, except with your permission, for security, or where the law requires.{" "}
        {LEGAL.product}&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>
        <b>Turning it off.</b> Click Disconnect on the Applications page, or remove {LEGAL.product} at{" "}
        <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>
        . To delete what we kept from your emails and calendar, write to {missing(LEGAL.email)} and we&apos;ll do it within 7 days.
      </p>
      <p>
        If you use the older Gmail script instead, it runs in your own Google account, sends us the same recruiting emails and meetings, and emails you a
        daily summary from your own Gmail.
      </p>
      <h2 className="display text-xl text-ink">Who handles it</h2>
      <p>Your data is stored with Convex (our database host) and the site runs on Vercel. To write drafts and scores, parts of your CV and the job posting are sent to Anthropic&apos;s Claude AI. Payments are handled by Razorpay; we never see your card or UPI details. We don&apos;t sell your data or use it for ads.</p>
      <h2 className="display text-xl text-ink">Your choices</h2>
      <p>You can edit or delete your CVs, jobs and connections at any time. To delete your whole account and its data, write to {missing(LEGAL.email)} and we&apos;ll do it within 7 days.</p>
      <h2 className="display text-xl text-ink">Contact</h2>
      <p>{missing(LEGAL.owner)}, {LEGAL.address}. {missing(LEGAL.email)}.</p>
    </LegalPage>
  );
}
