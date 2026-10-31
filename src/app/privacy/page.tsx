import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, missing } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy", description: "What JobPipe stores, why, and how Gmail and Calendar access is used under Google's Limited Use rules.", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Last updated {LEGAL.updated}. This policy explains what information {LEGAL.product} ({LEGAL.site}) collects, including Google user data, how we use
        it, who we share it with, how long we keep it, and how you can delete it.
      </p>
      <h2 className="display text-xl text-ink">Who we are</h2>
      <p>
        {LEGAL.product} is a job search tool for sales and go-to-market professionals, run by {missing(LEGAL.owner)} from {LEGAL.address}. For anything
        about your data, write to {missing(LEGAL.email)}.
      </p>
      <h2 className="display text-xl text-ink">Information we collect</h2>
      <p>
        <b>Account details:</b> your email address and password (stored only as a secure hash), and the name, LinkedIn link and target role you give when
        joining the waitlist.
      </p>
      <p>
        <b>What you add:</b> the CVs you upload, the roles and locations you pick, jobs you save and their notes, drafts we write for you, your saved
        application-form answers, your writing sample and any LinkedIn posts you paste, and LinkedIn connections or messages you choose to upload. From
        your messages file we keep a short summary per person, their last few lines, and up to 15 longer messages you wrote yourself, used only so
        drafts sound like you.
      </p>
      <p>
        <b>Google user data:</b> only if you click Connect Gmail. The section below lists exactly what is read and kept.
      </p>
      <p>
        <b>What we don&apos;t collect:</b> we use no advertising or analytics trackers and no tracking cookies. Your browser stores a sign-in token so you
        stay signed in.
      </p>
      <p>
        The free CV review at /cv-review works without an account. The CV you upload is read once, sent to our AI provider to write the review, and not stored. We keep
        your email, the role you picked and the review, so each email gets one free review.
      </p>
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
      <h2 className="display text-xl text-ink">How we use your information</h2>
      <p>
        Only to run your job search: finding and scoring jobs against your CV, writing tailored CVs, cover letters and messages, tracking your
        applications, and sending you service emails (your welcome email, sign-in codes, and the morning summary if you turn it on). We don&apos;t sell
        your information, use it for advertising, or use it to train AI models.
      </p>
      <h2 className="display text-xl text-ink">Who we share it with</h2>
      <p>
        Only these service providers, and only to run the features above: Convex (database and servers), Vercel (website hosting), Anthropic (Claude AI,
        which reads parts of your CV, the job posting and, for Gmail, the recruiting emails described above, to write scores and drafts; Anthropic does not
        use this data to train its models), Resend (sends our emails), and Razorpay (payments; we never see your card or UPI details). We share
        information with others only if the law requires it.
      </p>
      <h2 className="display text-xl text-ink">How we protect it</h2>
      <p>
        All traffic to {LEGAL.product} is encrypted (HTTPS). Passwords are stored as secure hashes. Your Google permission is stored encrypted and is never
        shown to anyone. Only you can see your data in the app; the owner can see waitlist details (name, email, LinkedIn link, target role) to let
        people in.
      </p>
      <h2 className="display text-xl text-ink">How long we keep it</h2>
      <p>
        We keep your information while your account is open. Google user data that doesn&apos;t match one of your jobs is discarded straight after it&apos;s
        checked. When you disconnect Gmail, we delete your stored Google permission and ask Google to cancel it. When you delete your account, we delete
        your account and everything in it, including any Google user data, within 7 days.
      </p>
      <h2 className="display text-xl text-ink">Your choices</h2>
      <p>
        You can edit or delete your CVs, jobs and connections at any time, and turn the morning search and Gmail on or off. To delete your whole account
        and its data, or to ask for a copy of it, write to {missing(LEGAL.email)} and we&apos;ll do it within 7 days.
      </p>
      <h2 className="display text-xl text-ink">Children</h2>
      <p>{LEGAL.product} is for working professionals and isn&apos;t meant for anyone under 18.</p>
      <h2 className="display text-xl text-ink">Changes to this policy</h2>
      <p>If we change what we collect or how we use it, we&apos;ll update this page and its date, and email you before any change to how Google user data is used.</p>
      <h2 className="display text-xl text-ink">Contact</h2>
      <p>{missing(LEGAL.owner)}, {LEGAL.address}. {missing(LEGAL.email)}.</p>
    </LegalPage>
  );
}
