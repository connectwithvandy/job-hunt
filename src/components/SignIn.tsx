"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useSyncExternalStore } from "react";
import { PLANS } from "@/lib/legal";
import { FAQ, STEPS, landingJsonLd } from "@/lib/marketing";
import { Spinner } from "./ui";

const noSubscribe = () => () => {};

// In order of what a sales job-seeker cares about most.
const POINTS = [
  [
    "Warm intros first",
    "See who you know at each company and get a referral note drafted for the best person to ask.",
  ],
  [
    "A score with a reason",
    "Every job is scored against every role you want. A misleading title costs you ten seconds, not an evening.",
  ],
  [
    "Tailored, never invented",
    "Your real facts, reordered and trimmed for each job. A fact check flags any number that isn't yours.",
  ],
  [
    "Several roles, several searches",
    "SDR leader and GTM strategist? Each role gets its own search, CV and pipeline.",
  ],
];

export function SignIn() {
  const { signIn } = useAuthActions();
  // The "you're in" email links to /?signin=1&email=… so they land on sign in, not "create account".
  // The server renders this page too and can't see the address bar, so read it after load.
  const search = useSyncExternalStore(
    noSubscribe,
    () => window.location.search,
    () => "",
  );
  const query = new URLSearchParams(search);
  const [picked, setFlow] = useState<
    "signUp" | "signIn" | "reset" | "reset-verification" | null
  >(null);
  const flow = picked ?? (query.get("signin") ? "signIn" : "signUp");
  const [typed, setEmail] = useState<string | null>(null);
  const email = typed ?? query.get("email") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resetting = flow === "reset" || flow === "reset-verification";

  const failText = {
    signUp:
      "Couldn't create the account. Passwords need 8 or more characters. Already signed up? Sign in instead.",
    signIn:
      'That email and password don\'t match. Try again, or use "Forgot password?" below.',
    reset:
      "Couldn't send the code. Check the email, or write to hello@jobpipe.in and we'll sort it.",
    "reset-verification":
      "That code didn't work or has expired. Check it or send a new one. New passwords need 8 or more characters.",
  }[flow];
  const head = {
    signUp: [
      "Join the waitlist",
      "Pick a password now. We let people in in small groups and email you the day you're in.",
    ],
    signIn: ["Welcome back", "Sign in to pick up where you left off."],
    reset: [
      "Forgot your password?",
      "Type your email and we'll send you an 8-digit code.",
    ],
    "reset-verification": [
      "Check your email",
      `We sent an 8-digit code to ${email}. It works for 15 minutes.`,
    ],
  }[flow];
  // The line under the headline, fitted to the screen they're on.
  const locked =
    "Happens to everyone. We'll email you a code, you pick a new password, and you're back in your search in a minute.";
  const pitch = {
    signUp:
      "Built by a sales leader in the middle of a real job hunt. Upload your CV, pick your target roles. Every morning JobPipe finds the jobs, scores the fit and shows who you know there.",
    signIn:
      "Your search kept going without you: this morning's jobs, scored against your CV, plus follow-ups due and who you know at each company.",
    reset: locked,
    "reset-verification": locked,
  }[flow];
  const button = {
    signUp: "Join the waitlist",
    signIn: "Sign in",
    reset: "Send me a code",
    "reset-verification": "Set new password and sign in",
  }[flow];

  return (
    <div className="mx-auto max-w-6xl px-5 lg:px-12">
      {/* What the app is, how it works and the FAQ, for Google and AI answer tools. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd()) }}
      />
      <div className="grid min-h-screen items-center gap-12 py-12 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <p className="display text-sm uppercase tracking-wide">
            JobPipe<span className="text-accent">.</span>
          </p>
          <h1 className="display mt-6 text-4xl leading-[1.05] md:text-6xl">
            You&apos;re not looking for <span className="text-accent">a</span>{" "}
            job.
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
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{8}"
                  maxLength={8}
                  className="field mt-1"
                />
              </label>
              <label className="mt-4 block">
                <span className="label">New password</span>
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="field mt-1"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className="label">Email</span>
                <input
                  key={email}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={email}
                  className="field mt-1"
                />
              </label>
              {flow !== "reset" && (
                <label className="mt-4 block">
                  <span className="label">Password</span>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={
                      flow === "signUp" ? "new-password" : "current-password"
                    }
                    className="field mt-1"
                  />
                </label>
              )}
            </>
          )}
          <input name="flow" type="hidden" value={flow} />
          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
          <button
            className="btn btn-primary mt-6 w-full justify-center"
            disabled={busy}
          >
            {busy && <Spinner />}
            {button}
          </button>
          {flow === "signIn" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-ink-3 hover:text-ink"
              onClick={() => setFlow("reset")}
            >
              Forgot password?
            </button>
          )}
          {flow === "reset-verification" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-ink-3 hover:text-ink"
              onClick={() => setFlow("reset")}
            >
              Didn&apos;t get it? Send a new code
            </button>
          )}
          <button
            type="button"
            className="mt-2 w-full text-center text-sm text-ink-3 hover:text-ink"
            onClick={() =>
              setFlow(
                resetting ? "signIn" : flow === "signUp" ? "signIn" : "signUp",
              )
            }
          >
            {resetting
              ? "Back to sign in"
              : flow === "signUp"
                ? "Already have an account? Sign in"
                : "New here? Join the waitlist"}
          </button>
          {flow === "signUp" && (
            <p className="mt-5 border-t border-line pt-4 text-xs text-ink-3">
              {PLANS.trialDays}-day free trial once you&apos;re in, then ₹
              {PLANS.full}/month (₹{PLANS.founding} for the first{" "}
              {PLANS.foundingSeats} members). No card needed to join. Your CV is
              used only to run your search; we don&apos;t sell your data or use
              it for ads.
            </p>
          )}
        </form>
      </div>

      <section className="border-t border-line py-16">
        <h2 className="display text-3xl">How JobPipe works</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step} className="border-l-2 border-accent pl-4">
              <div className="display text-accent">{i + 1}</div>
              <p className="mt-1 text-sm text-ink-2">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line py-16">
        <h2 className="display text-3xl">Questions people ask</h2>
        <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <h3 className="font-medium">{q}</h3>
              <p className="mt-2 text-sm text-ink-2">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line py-8 text-xs text-ink-3">
        <span>
          JobPipe<span className="text-accent">.</span>
        </span>
        <a href="/pricing" className="hover:text-ink">
          Pricing
        </a>
        <a href="/terms" className="hover:text-ink">
          Terms
        </a>
        <a href="/privacy" className="hover:text-ink">
          Privacy
        </a>
        <a href="/refunds" className="hover:text-ink">
          Refunds
        </a>
        <a href="/contact" className="hover:text-ink">
          Contact
        </a>
        <a
          href="https://github.com/connectwithvandy/job-hunt"
          className="hover:text-ink"
          target="_blank"
          rel="noreferrer"
        >
          Open source on GitHub
        </a>
      </footer>
    </div>
  );
}
