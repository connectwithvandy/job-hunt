"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errors";

/** A page crashed: say so plainly, offer a retry, and tell the owner. */
export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <div className="card mx-auto mt-12 max-w-xl p-8">
      <h1 className="display text-2xl">This page hit a problem</h1>
      <p className="mt-2 text-sm text-ink-2">It&apos;s been reported, so it&apos;ll get fixed. Your data is safe.</p>
      <button className="btn btn-primary mt-5" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
