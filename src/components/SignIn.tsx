"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { LEGAL, PLANS } from "@/lib/legal";
import { FAQ, landingJsonLd } from "@/lib/marketing";
import { Spinner } from "./ui";

const noSubscribe = () => () => {};

// Small line icons for the feature cards.
const ICONS: Record<string, React.ReactNode> = {
  intro: <path d="M16 11a4 4 0 1 0-8 0M4 20a8 8 0 0 1 16 0M12 7V3m-4 2 1 1m7-1-1 1" />,
  score: <path d="M4 19h16M7 16V9m5 7V5m5 11v-4" />,
  fact: <path d="m5 12 4 4L19 6M5 20h14" />,
  roles: <path d="M4 6h16M4 12h10M4 18h6m8-6 3 3-3 3" />,
};
function Icon({ name }: { name: string }) {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
    </span>
  );
}

// A made-up morning, to show what the Today page looks like. Labelled as an example on the page.
const EXAMPLE_JOBS = [
  { co: "Northwind AI", title: "Enterprise Account Executive, India", where: "Bengaluru", score: 91, why: "Enterprise SaaS, quota size matches yours", warm: 2 },
  { co: "Kitebird", title: "Head of Sales Development, APAC", where: "Remote · APAC", score: 84, why: "You've built SDR teams; they want an outbound playbook", warm: 1 },
  { co: "Lumen Cloud", title: "GTM Strategy Lead", where: "Bengaluru · hybrid", score: 58, why: "Strong on GTM, but they want a fintech background", warm: 0 },
];

// In order of what a sales job-seeker cares about most.
const POINTS = [
  [
    "intro",
    "Warm intros first",
    "See who you know at each company and get a referral note drafted for the best person to ask.",
  ],
  [
    "score",
    "A score with a reason",
    "Every job is scored against every role you want. A misleading title costs you ten seconds, not an evening.",
  ],
  [
    "fact",
    "Tailored, never invented",
    "Your real facts, reordered and trimmed for each job. A fact check flags any number that isn't yours.",
  ],
  [
    "roles",
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
    <div className="relative isolate overflow-hidden">
    <div className="mx-auto max-w-6xl px-5 lg:px-12">
      {/* What the app is, how it works and the FAQ, for Google and AI answer tools. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd()) }}
      />
      <header className="flex items-center justify-between py-6">
        <span className="display text-lg uppercase tracking-wide">
          JobPipe<span className="text-accent">.</span>
        </span>
        <nav className="flex items-center gap-6 text-sm text-ink-2">
          <a href="#faq" className="hidden hover:text-ink md:inline">FAQ</a>
          <Link href="/pricing" className="hidden hover:text-ink sm:inline">Pricing</Link>
          <Link href="/cv-review" className="hidden hover:text-ink sm:inline">Free CV review</Link>
          <button
            type="button"
            onClick={() => {
              setFlow("signIn");
              document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="rounded-full border border-line px-4 py-1.5 text-ink hover:border-accent"
          >
            Sign in
          </button>
        </nav>
      </header>

      <div className="grid items-center gap-12 pb-20 pt-10 lg:min-h-[calc(100vh-88px)] lg:grid-cols-[1.2fr_1fr] lg:pt-0">
        <section>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card/60 px-3 py-1 text-xs text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            For sales and GTM people · India, APAC, EMEA
          </p>
          <h1 className="display mt-6 text-4xl leading-[1.02] md:text-[64px]">
            You&apos;re not looking for <span className="text-accent">a</span>{" "}
            job.
            <br />
            You&apos;re running several searches at once.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">{pitch}</p>
          <Link
            href="/cv-review"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            Not ready to join? Get a free CV review for sales roles →
          </Link>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-3">
            <li>✓ Never invents facts</li>
            <li>✓ No spam applying</li>
            <li>✓ Open source</li>
          </ul>
          <a
            href={LEGAL.founderLinkedIn}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-3 rounded-full border border-line bg-card/60 py-1.5 pl-1.5 pr-4 text-sm text-ink-2 hover:border-accent"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-on-accent">{LEGAL.founder[0]}</span>
            <span>
              Built by <span className="text-ink">{LEGAL.founder}</span>, a sales leader · <span className="text-ink underline decoration-accent underline-offset-4">LinkedIn</span>
            </span>
          </a>
        </section>

        <form
          id="join"
          key={flow}
          className="card relative p-7"
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

      <section className="border-t border-line py-20">
        <p className="label text-accent">Why it works</p>
        <h2 className="display mt-3 max-w-2xl text-4xl leading-tight">Built for how sales people actually job hunt</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {POINTS.map(([icon, title, text]) => (
            <li key={title} className="card p-6 transition-colors hover:border-accent/40">
              <Icon name={icon} />
              <h3 className="mt-5 text-lg font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line py-20">
        <p className="label text-accent">Your morning</p>
        <h2 className="display mt-3 max-w-2xl text-4xl leading-tight">Open Today. Know exactly what to do.</h2>
        <div className="card mt-10 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-4 text-sm">
            <span className="font-medium">Today · 3 new jobs worth applying to</span>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-3">Example</span>
          </div>
          <ul>
            {EXAMPLE_JOBS.map((j) => (
              <li key={j.co} className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-5 last:border-0">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-soft text-sm font-semibold text-ink-2">
                  {j.co.split(" ").map((w) => w[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{j.title}</p>
                  <p className="text-sm text-ink-3">
                    {j.co} · {j.where}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">{j.why}</p>
                </div>
                {j.warm > 0 && (
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
                    {j.warm} warm {j.warm === 1 ? "intro" : "intros"}
                  </span>
                )}
                <span className={`display w-14 text-right text-3xl ${j.score >= 75 ? "text-accent" : "text-ink-3"}`}>{j.score}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>


      {/* Answers stay in the page when closed, so search engines and AI tools still read them. */}
      <section id="faq" className="grid gap-10 border-t border-line py-20 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="label text-accent">FAQ</p>
          <h2 className="display mt-3 text-4xl leading-tight">
            Questions people ask
          </h2>
          <p className="mt-4 text-sm text-ink-2">
            Something else?{" "}
            <a
              href="mailto:hello@jobpipe.in"
              className="text-ink underline decoration-accent underline-offset-4"
            >
              hello@jobpipe.in
            </a>
          </p>
        </div>
        <div className="border-t border-line">
          {FAQ.map(([q, a], i) => (
            <details
              key={q}
              className="group border-b border-line"
              open={i === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden">
                <h3 className="text-base font-medium transition-colors group-hover:text-accent md:text-lg">
                  {q}
                </h3>
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-lg text-ink-2 transition-transform duration-200 group-open:rotate-45 group-open:border-accent group-open:text-accent"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-6 pr-12 text-sm leading-relaxed text-ink-2">
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="relative my-10 overflow-hidden rounded-3xl border border-line bg-card px-8 py-14 text-center">
        <h2 className="display relative mx-auto max-w-2xl text-3xl leading-tight md:text-4xl">Your next role is probably already posted.</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-ink-2">Let JobPipe find it, score it and show you who can get you in.</p>
        <button
          type="button"
          className="btn btn-primary relative mt-8"
          onClick={() => {
            setFlow("signUp");
            document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          Join the waitlist
        </button>
      </section>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line py-8 text-xs text-ink-3">
        <span>
          JobPipe<span className="text-accent">.</span>
        </span>
        <Link href="/cv-review" className="hover:text-ink">
          Free CV review
        </Link>
        <Link href="/sales-jobs" className="hover:text-ink">
          Sales job guides
        </Link>
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
    </div>
  );
}
