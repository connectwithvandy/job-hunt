"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { JobsByEmail } from "./JobsByEmail";
import { CvTopJobs } from "./CvTopJobs";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LEGAL, PLANS } from "@/lib/legal";
import { FAQ, jsonLdGraph, landingJsonLd } from "@/lib/marketing";
import { CountUp, Reveal, Rotate } from "./Motion";
import { Spinner } from "./ui";
import { PublicHeader } from "@/components/PublicHeader";
import { Logo } from "@/components/Sidebar";

/** The home page footer: what JobPipe does, how it compares, the guides, and the free research. */
const FOOTER: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Find sales jobs in India" },
      { href: "/#top-jobs", label: "Top 5 jobs from your CV" },
      { href: "/cv-review", label: "Free CV review" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Compare",
    links: [{ href: "/compare", label: "JobPipe vs other tools" }],
  },
  {
    title: "Guides",
    links: [
      { href: "/sales-jobs/sdr-vs-bdr", label: "SDR vs BDR" },
      { href: "/sales-jobs/sdr-salary-india", label: "SDR salary in India" },
      { href: "/sales-jobs/account-executive-salary-india", label: "AE salary in India" },
      { href: "/sales-jobs/sales-interview-questions", label: "Sales interview questions" },
      { href: "/sales-jobs/sales-resume", label: "Sales resume guide" },
      { href: "/sales-jobs", label: "All guides" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/sales-jobs/india-sales-hiring-index", label: "India sales hiring index" },
      { href: "/sales-jobs/sdr-bdr-jobs-india", label: "SDR and BDR jobs in India" },
      { href: "/sales-jobs/account-executive-jobs-bengaluru", label: "AE jobs in Bengaluru" },
      { href: "/sales-jobs/remote-sales-jobs-apac", label: "Remote sales jobs in APAC" },
      { href: "/sales-jobs/in/bengaluru", label: "Sales jobs in Bengaluru" },
      { href: "/tools/ote-calculator", label: "Sales OTE calculator" },
      { href: "https://github.com/connectwithvandy/job-hunt", label: "⭐ Star JobPipe on GitHub" },
    ],
  },
];

const noSubscribe = () => () => {};

// Small line icons for the feature cards.
// A made-up morning, to show what the Today page looks like. Labelled as an example on the page.
const EXAMPLE_JOBS = [
  { co: "Northwind AI", title: "Enterprise Account Executive, India", where: "Bengaluru", score: 91, why: "Enterprise SaaS, quota size matches yours", warm: 2 },
  { co: "Kitebird", title: "Head of Sales Development, APAC", where: "Remote · APAC", score: 84, why: "You've built SDR teams; they want an outbound playbook", warm: 1 },
  { co: "Lumen Cloud", title: "GTM Strategy Lead", where: "Bengaluru · hybrid", score: 58, why: "Strong on GTM, but they want a fintech background", warm: 0 },
];

/** The sales pipeline stages, mapped to what JobPipe does at each. */
const STAGES: [string, string][] = [
  ["Prospect", "New sales roles land every morning for each role you want, from job boards and company careers pages."],
  ["Qualify", "Every role gets a fit score against your CV, with the reason, so you skip the bad fits."],
  ["Outreach", "A tailored CV from your real facts, never invented, plus a referral ask and a note to the hiring manager."],
  ["Follow up", "Nudges when an application goes quiet, and replies tracked from your inbox."],
  ["Close", "Interview prep from your own stories, then the offer."],
];



/** `note` sits above the landing page to say why it's showing, e.g. on a job's apply link. */
export function SignIn({ note }: { note?: string } = {}) {
  const { signIn } = useAuthActions();
  const googleOn = useQuery(api.access.googleOn);
  // The "you're in" email links to /?signin=1&email=… so they land on sign in, not "create account".
  // The server renders this page too and can't see the address bar, so read it after load.
  const search = useSyncExternalStore(
    noSubscribe,
    () => window.location.search,
    () => "",
  );
  const query = new URLSearchParams(search);
  // A friend's invite link (jobpipe.in/?ref=CODE): remember the code until they sign up, so the friend gets the credit.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    try {
      if (ref) localStorage.setItem("jobpipeRef", ref.slice(0, 12));
      // Where they came from, kept from the first visit (a job page from the LinkedIn post sets it too).
      if (!localStorage.getItem("jobpipeSource")) {
        const from = params.get("utm_source") ?? (ref ? "invite" : /linkedin|lnkd\.in/i.test(document.referrer) ? "linkedin" : /google\./i.test(document.referrer) ? "google" : /chatgpt|openai|perplexity|claude\.ai|gemini/i.test(document.referrer) ? "ai-search" : null);
        if (from) localStorage.setItem("jobpipeSource", from.slice(0, 40));
      }
    } catch {}
  }, []);
  const [picked, setFlow] = useState<
    "signUp" | "signIn" | "reset" | "reset-verification" | null
  >(null);
  const flow = picked ?? (query.get("signin") ? "signIn" : "signUp");
  const [typed, setEmail] = useState<string | null>(null);
  const email = typed ?? query.get("email") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resetting = flow === "reset" || flow === "reset-verification";
  // Switch the form beside the headline and bring it into view.
  const start = (f: "signUp" | "signIn") => {
    setFlow(f);
    setError("");
    document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

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
      "Start free",
      "Pick a password. Sales and GTM people get in straight away.",
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
      "Upload your CV, pick your target roles. Every morning JobPipe finds the jobs, scores the fit and helps you find who you know there.",
    signIn:
      "Your search kept going without you: this morning's jobs, scored against your CV, plus follow-ups due and people to ask for a referral.",
    reset: locked,
    "reset-verification": locked,
  }[flow];
  const button = {
    signUp: "Start free",
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph(landingJsonLd())) }}
      />
      <PublicHeader onSignIn={() => start("signIn")} onStart={() => start("signUp")} />
      {note && <p className="card border-accent p-4 text-ink">{note}</p>}

      <div className="grid items-center gap-10 pb-16 pt-8 md:pt-14 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pb-24">
        <section>
        <p className="rise inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          For SDRs, AEs and sales leaders, wherever you are
        </p>
        <h1 style={{ animationDelay: "80ms" }} className="rise display mt-6 text-balance text-[38px] leading-[1.04] md:text-[52px]">
          <span className="block">Your job search,</span>
          <span className="block text-ink-2">
            {/* On a phone, "run like your" stays on one line and "pipeline." drops below it. */}
            <span className="whitespace-nowrap">run like your</span> <span className="text-accent">pipeline</span>.
          </span>
        </h1>
        <p style={{ animationDelay: "120ms" }} className="rise mt-5 text-lg text-ink-2">
          Searching for <Rotate words={["Account Executive", "SDR Manager", "Head of Sales", "GTM Lead", "Founder's Office", "BDR"]} />
        </p>
        <p style={{ animationDelay: "160ms" }} className="rise mt-6 max-w-xl text-lg leading-relaxed text-ink-2">{pitch}</p>
        <a href="#top-jobs" style={{ animationDelay: "240ms" }} className="rise mt-6 flex w-fit items-center gap-2 text-sm font-medium text-accent hover:underline">
          Not ready to join? See your top 5 sales jobs from your CV →
        </a>
        <Link href="/cv-review" style={{ animationDelay: "260ms" }} className="rise mt-2 flex w-fit items-center gap-2 text-sm text-ink-2 hover:text-accent hover:underline">
          Or get a free CV review for sales roles
        </Link>
        <p style={{ animationDelay: "300ms" }} className="rise mt-6 text-sm text-ink-3">Never invents facts · No spam applying · Open source</p>
        </section>
          <form
            id="join"
            key={flow}
            style={{ animationDelay: "200ms" }}
            // Signing in (or resetting) on a phone: the form comes first, above the pitch (27 Nov review: it sat below the fold).
            className={`rise card relative scroll-mt-24 p-7 ${flow === "signUp" ? "" : "max-lg:order-first"}`}
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
            {/* One tap for people who live in Google (27 Nov review: password only lost people at sign-in). Shown only
                when the Google keys are set, so the button always works. */}
            {googleOn && (flow === "signUp" || flow === "signIn") && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary w-full justify-center gap-2"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void signIn("google", { redirectTo: "/" }).catch((err) => {
                      setError(errorMessage(err));
                      setBusy(false);
                    });
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
                    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
                    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
                    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
                  </svg>
                  Continue with Google
                </button>
                <p className="my-4 text-center text-[13px] text-ink-3">or with email</p>
              </>
            )}
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
                  : "New here? Start free"}
            </button>
            {flow === "signUp" && (
              <p className="mt-5 border-t border-line pt-4 text-xs text-ink-3">
                {PLANS.trialDays} days of everything once you&apos;re in, then a
                free plan that stays free. Every AI tool from ₹{PLANS.founding} for 1 month, or ₹{PLANS.foundingPass} for{" "}
                {PLANS.passMonths} months. No card needed to join. Your CV is
                used only to run your search; we don&apos;t sell your data or use
                it for ads.
              </p>
            )}
          </form>
      </div>

      <div className="mx-auto max-w-3xl pb-20">
        <CvTopJobs />
      </div>

      {/* A picture of the app, so people see what they get before signing up. */}
      <div className="float mx-auto max-w-5xl pb-24">
        <div style={{ animationDelay: "380ms" }} className="rise tilt overflow-hidden rounded-2xl border border-line bg-card shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="mx-auto rounded-md bg-soft px-3 py-0.5 text-xs text-ink-3">jobpipe.in</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] text-left md:grid-cols-[180px_minmax(0,1fr)]">
            <aside className="hidden border-r border-line p-5 text-sm md:block">
              <p className="inline-flex">
                <Logo />
              </p>
              <ul className="mt-6 space-y-1 text-ink-3">
                <li className="rounded-lg bg-soft px-3 py-1.5 font-medium text-accent">Today</li>
                <li className="px-3 py-1.5">Jobs</li>
                <li className="px-3 py-1.5">Companies</li>
                <li className="px-3 py-1.5">People</li>
              </ul>
            </aside>
            <div className="p-5 md:p-8">
              <p className="text-xs text-ink-3">Monday morning</p>
              <p className="display mt-1 text-2xl">Good morning, Priya</p>
              <div className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
                {[
                  ["Companies asked", "3", "/ 10"],
                  ["Applications", "2", "/ 5"],
                  ["Follow-ups due", "1", ""],
                ].map(([label, n, of]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-line p-3">
                    <p className="truncate text-[11px] text-ink-3">{label}</p>
                    <p className="display mt-1 text-xl">
                      <CountUp to={Number(n)} />
                      <span className="text-sm text-ink-3"> {of}</span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-7 text-sm font-medium">Apply to new jobs</p>
              <ul className="mt-3 rounded-xl border border-line">
                {EXAMPLE_JOBS.map((j, i) => (
                  <Reveal as="li" delay={300 + i * 160} key={j.co} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-soft text-xs font-semibold text-ink-2">
                      {j.co.split(" ").map((w) => w[0]).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{j.title}</p>
                      <p className="truncate text-xs text-ink-3">
                        {j.co} · {j.where} · {j.why}
                      </p>
                    </div>
                    {j.warm > 0 && (
                      <span className="glow hidden rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs text-accent sm:inline">
                        {j.warm} warm {j.warm === 1 ? "intro" : "intros"}
                      </span>
                    )}
                    <span className={`display w-10 text-right text-2xl ${j.score >= 75 ? "text-accent" : "text-ink-3"}`}>
                      <CountUp to={j.score} />
                    </span>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">An example morning. Every score comes with the reasons behind it.</p>
      </div>


      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-2xl">
          <JobsByEmail heading="Not ready to sign up? Get new sales jobs by email" />
        </div>
      </section>

      {/* The positioning (21 Nov 2026): sales people already run pipelines, so the app is shown as one. */}
      <section className="border-t border-line py-20">
        <p className="label text-accent">How it works</p>
        <h2 className="display mt-3 max-w-2xl text-4xl leading-tight">You know how to work a pipeline. Now work one for your career.</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STAGES.map(([stage, text], i) => (
            <Reveal as="li" delay={i * 110} key={stage} className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {i + 1}. {stage}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{text}</p>
            </Reveal>
          ))}
        </ol>
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

      <Reveal as="section" className="relative my-10 overflow-hidden rounded-3xl border border-line bg-card px-8 py-14 text-center">
        <h2 className="display relative mx-auto max-w-2xl text-3xl leading-tight md:text-4xl">Your next role is probably already posted.</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-ink-2">Let JobPipe find it, score it and show you who can get you in.</p>
        <button
          type="button"
          className="btn btn-primary relative mt-8"
          onClick={() => start("signUp")}
        >
          Start your free trial
        </button>
      </Reveal>

      <div className="flex justify-center py-6">
      <a
        href={LEGAL.founderLinkedIn}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-3 rounded-full border border-line bg-card/60 py-1.5 pl-1.5 pr-4 text-sm text-ink-2 hover:border-accent"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-on-accent">{LEGAL.founder[0]}</span>
        <span>
          Built by <span className="text-ink">{LEGAL.founder}</span>, a sales leader · <span className="text-ink underline decoration-accent underline-offset-4">LinkedIn</span>
        </span>
      </a>
      </div>

      {/* Grouped like Dreamwork's footer (19 Nov): easier to scan, and every guide is one click from the home page for search engines. */}
      <footer className="border-t border-line py-10 text-sm">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER.map((col) => (
            <div key={col.title}>
              <div className="label mb-3">{col.title}</div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-ink-2 hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-6 text-xs text-ink-3">
          <span>
            © 2026 JobPipe
          </span>
          <Link href="/about" className="hover:text-ink">About</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/refunds" className="hover:text-ink">Refunds</Link>
          <Link href="/contact" className="hover:text-ink">Contact</Link>
          <a href="https://github.com/connectwithvandy/job-hunt" className="hover:text-ink" target="_blank" rel="noreferrer">
            Open source on GitHub
          </a>
        </div>
      </footer>
    </div>
    </div>
  );
}
