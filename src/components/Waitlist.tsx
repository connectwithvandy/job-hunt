"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

/** Signed up but not let in yet. */
export function Waitlist({ email, onWaitlist }: { email: string; onWaitlist: boolean }) {
  const { signOut } = useAuthActions();
  const join = useMutation(api.access.join);
  useEffect(() => {
    if (!onWaitlist) void join();
  }, [onWaitlist, join]);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-12">
      <p className="display text-sm uppercase tracking-wide">
        JobPipe<span className="text-accent">.</span>
      </p>
      <h1 className="display mt-6 text-4xl leading-[1.05] md:text-5xl">You&apos;re on the waitlist.</h1>
      <p className="mt-5 text-lg text-ink-2">
        JobPipe is letting people in a few at a time. Leave this page open or come back later: once you&apos;re let in, it opens by itself. Sign in with{" "}
        {email || "the same email"} next time.
      </p>
      <button type="button" onClick={() => void signOut()} className="mt-8 self-start text-sm text-ink-3 hover:text-ink">
        Sign out
      </button>
    </div>
  );
}
