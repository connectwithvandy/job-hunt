"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "@/lib/errors";

const ROLES = ["Account Executive", "SDR / BDR", "Sales leadership", "GTM strategy / AI GTM", "Founder's Office", "Other"];

/** Signed up but not let in yet. A few questions help the owner let the right people in first. */
export function Waitlist({ email, onWaitlist, answered }: { email: string; onWaitlist: boolean; answered: boolean }) {
  const { signOut } = useAuthActions();
  const join = useMutation(api.access.join);
  const describe = useMutation(api.access.describe);
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!onWaitlist) void join();
  }, [onWaitlist, join]);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-12">
      <p className="display text-sm uppercase tracking-wide">
        JobPipe<span className="text-accent">.</span>
      </p>
      <h1 className="display mt-6 text-4xl leading-[1.05] md:text-5xl">You&apos;re on the waitlist.</h1>
      {answered || !onWaitlist ? (
        <p className="mt-5 text-lg text-ink-2">
          Thanks. We let people in a few at a time and email you when it&apos;s your turn. Leave this page open and it opens by itself, or come back after the email.
          Sign in with {email || "the same email"} next time.
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await describe({ name, linkedin, role });
            } catch (err) {
              setError(errorMessage(err));
            }
            setBusy(false);
          }}
        >
          <p className="text-lg text-ink-2">Three quick questions, so we let the right people in first.</p>
          <label className="block">
            <span className="label">Your name</span>
            <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
          <label className="block">
            <span className="label">LinkedIn profile link</span>
            <input className="field mt-1" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/your-name" />
          </label>
          <div>
            <span className="label">What role are you after?</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${role === r ? "border-accent text-ink" : "border-line text-ink-2 hover:border-ink-3"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-bad">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      <button type="button" onClick={() => void signOut()} className="mt-8 self-start text-sm text-ink-3 hover:text-ink">
        Sign out
      </button>
    </div>
  );
}
