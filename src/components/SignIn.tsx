"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { Spinner } from "./ui";

const POINTS = [
  ["Several roles, not one search", "SDR leader on Monday, GTM strategist on Tuesday. Each role gets its own search, CV and pipeline."],
  ["A score with a reason", "Every job is read against every role you want, so a misleading title costs you ten seconds, not an evening."],
  ["Tailored, never invented", "Your CV is reordered and trimmed for each role. A fact check flags any number that isn't yours."],
  ["Warm intros first", "See who you know at each company, and get a personal referral note for the one or two best people to ask."],
];

export function SignIn() {
  const { signIn } = useAuthActions();
  // The "you're in" email links to /?signin=1&email=… so they land on sign in, not "create account".
  // Only rendered in the browser (Shell shows a loader first), so reading the address bar here is safe.
  const [query] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search));
  const [flow, setFlow] = useState<"signUp" | "signIn" | "reset" | "reset-verification">(query.get("signin") ? "signIn" : "signUp");
  const [email, setEmail] = useState(query.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resetting = flow === "reset" || flow === "reset-verification";

  const failText = {
    signUp: "Couldn't create the account. The password needs 8 or more characters, or the email may already have an account.",
    signIn: "That email and password don't match. Use \"Forgot password?\" below to set a new one.",
    reset: "Couldn't send the code. Check the email, or write to hello@jobpipe.in and we'll reset it for you.",
    "reset-verification": "That code didn't work, or it's over 15 minutes old. Check it, or ask for a new one. The new password needs 8 or more characters.",
  }[flow];
  const head = {
    signUp: ["Start your hunt", "Free. Takes two minutes, plus your CV."],
    signIn: ["Welcome back", "Sign in to pick up where you left off."],
    reset: ["Forgot your password?", "Type your email and we'll send you a code to set a new one."],
    "reset-verification": ["Check your email", `We sent an 8-digit code to ${email}. It works for 15 minutes.`],
  }[flow];
  // The line under the headline, fitted to the screen they're on.
  const pitch = {
    signUp:
      "Built by a sales leader during a real job hunt. Join the waitlist; once you're in, upload your CV, pick the kinds of roles you're after, and let it do the sorting, tailoring and intro hunting.",
    signIn: "Your search is where you left it: today's new jobs scored against your CV, follow-ups due, and who you know at each company.",
    reset: "Locked out? It happens. We'll email you a code, you pick a new password, and you're back to your search in a minute.",
    "reset-verification": "Locked out? It happens. We'll email you a code, you pick a new password, and you're back to your search in a minute.",
  }[flow];
  const button = { signUp: "Create account", signIn: "Sign in", reset: "Send me a code", "reset-verification": "Set new password and sign in" }[flow];

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-5 py-12 lg:grid-cols-[1.2fr_1fr] lg:px-12">
      <section>
        <p className="display text-sm uppercase tracking-wide">
          JobPipe<span className="text-accent">.</span>
        </p>
        <h1 className="display mt-6 text-4xl leading-[1.05] md:text-6xl">
          You&apos;re not looking for <span className="text-accent">a</span> job.
          <br />
          You&apos;re running several searches at once.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-2">{pitch}</p>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2">
          {POINTS.map(([title, text]) => (
            <li key={title} className="border-l-2 border-accent pl-4">
              <div className="font-medium">{title}</div>
              <p className="mt-1 text-sm text-ink-2">{text}</p>
            </li>
          ))}
        </ul>
        <a href="https://github.com/connectwithvandy/job-hunt" className="mt-10 inline-block text-sm text-ink-3 underline hover:text-ink" target="_blank" rel="noreferrer">
          Open source on GitHub
        </a>
        <nav className="mt-4 flex flex-wrap gap-4 text-xs text-ink-3">
          <a href="/pricing" className="hover:text-ink">Pricing</a>
          <a href="/terms" className="hover:text-ink">Terms</a>
          <a href="/privacy" className="hover:text-ink">Privacy</a>
          <a href="/refunds" className="hover:text-ink">Refunds</a>
          <a href="/contact" className="hover:text-ink">Contact</a>
        </nav>
      </section>

      <form
        key={flow}
        className="card p-7"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(e.currentTarget);
          signIn("password", data)
            .then(() => {
              if (flow === "reset") {
                setEmail(String(data.get("email") ?? ""));
                setFlow("reset-verification");
              }
            })
            .catch(() => setError(failText))
            .finally(() => setBusy(false));
        }}
      >
        <h2 className="display text-2xl">{head[0]}</h2>
        <p className="mt-1 mb-6 text-sm text-ink-2">{head[1]}</p>
        {flow === "reset-verification" ? (
          <>
            <input name="email" type="hidden" value={email} />
            <label className="block">
              <span className="label">Code</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{8}" maxLength={8} className="field mt-1" />
            </label>
            <label className="mt-4 block">
              <span className="label">New password</span>
              <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="field mt-1" />
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="label">Email</span>
              <input name="email" type="email" required autoComplete="email" defaultValue={email} className="field mt-1" />
            </label>
            {flow !== "reset" && (
              <label className="mt-4 block">
                <span className="label">Password</span>
                <input name="password" type="password" required minLength={8} autoComplete={flow === "signUp" ? "new-password" : "current-password"} className="field mt-1" />
              </label>
            )}
          </>
        )}
        <input name="flow" type="hidden" value={flow} />
        {error && <p className="mt-4 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary mt-6 w-full justify-center" disabled={busy}>
          {busy && <Spinner />}
          {button}
        </button>
        {flow === "signIn" && (
          <button type="button" className="mt-4 w-full text-center text-sm text-ink-3 hover:text-ink" onClick={() => setFlow("reset")}>
            Forgot password?
          </button>
        )}
        {flow === "reset-verification" && (
          <button type="button" className="mt-4 w-full text-center text-sm text-ink-3 hover:text-ink" onClick={() => setFlow("reset")}>
            Didn&apos;t get it? Send a new code
          </button>
        )}
        <button
          type="button"
          className="mt-2 w-full text-center text-sm text-ink-3 hover:text-ink"
          onClick={() => setFlow(resetting ? "signIn" : flow === "signUp" ? "signIn" : "signUp")}
        >
          {resetting ? "Back to sign in" : flow === "signUp" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}
