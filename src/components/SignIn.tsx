"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { Spinner } from "./ui";

const POINTS = [
  ["Tracks, not one search", "SDR leader on Monday, GTM strategist on Tuesday. Each game gets its own CV angle, pitch and pipeline."],
  ["A score with a reason", "Every job is read against every track, so a misleading title costs you ten seconds, not an evening."],
  ["Tailored, never invented", "Your CV is reordered and trimmed for each role. A fact check flags any number that isn't yours."],
  ["Warm intros first", "See who you know at each company, and get a personal referral note for the one or two best people to ask."],
];

export function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signUp" | "signIn">("signUp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-5 py-12 lg:grid-cols-[1.2fr_1fr] lg:px-12">
      <section>
        <p className="display text-sm uppercase tracking-wide">
          Pipeline<span className="text-accent">.</span>
        </p>
        <h1 className="display mt-6 text-4xl leading-[1.05] md:text-6xl">
          You&apos;re not looking for <span className="text-accent">a</span> job.
          <br />
          You&apos;re running several searches at once.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-2">
          Built by a sales leader during a real job hunt, now free for anyone. Upload your CV, pick the kinds of roles you&apos;re after, and let it do the
          sorting, tailoring and intro hunting.
        </p>
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
      </section>

      <form
        className="card p-7"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          signIn("password", new FormData(e.currentTarget))
            .catch(() =>
              setError(
                flow === "signUp"
                  ? "Couldn't create the account. The password needs 8 or more characters, or the email may already have an account."
                  : "That email and password don't match.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <h2 className="display text-2xl">{flow === "signUp" ? "Start your hunt" : "Welcome back"}</h2>
        <p className="mt-1 mb-6 text-sm text-ink-2">{flow === "signUp" ? "Free. Takes two minutes, plus your CV." : "Sign in to pick up where you left off."}</p>
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete="email" className="field mt-1" />
        </label>
        <label className="mt-4 block">
          <span className="label">Password</span>
          <input name="password" type="password" required minLength={8} autoComplete={flow === "signUp" ? "new-password" : "current-password"} className="field mt-1" />
        </label>
        <input name="flow" type="hidden" value={flow} />
        {error && <p className="mt-4 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary mt-6 w-full justify-center" disabled={busy}>
          {busy && <Spinner />}
          {flow === "signUp" ? "Create account" : "Sign in"}
        </button>
        <button type="button" className="mt-4 w-full text-center text-sm text-ink-3 hover:text-ink" onClick={() => setFlow(flow === "signUp" ? "signIn" : "signUp")}>
          {flow === "signUp" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}
