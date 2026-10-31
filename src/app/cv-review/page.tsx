"use client";

import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { REVIEW_ROLES, type Review } from "../../../convex/lib/cvReview";
import { Spinner } from "@/components/ui";

/** The free CV review: no account, one per email. The CV is read once and not kept. */
export default function CvReview() {
  const review = useAction(api.cvReview.review);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Review | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:px-12">
      <Link href="/" className="display text-sm uppercase tracking-wide">
        JobPipe<span className="text-accent">.</span>
      </Link>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.1fr_1fr]">
        <section>
          <p className="label text-accent">Free · no sign-up</p>
          <h1 className="display mt-3 text-4xl leading-[1.05] md:text-5xl">Would a sales hiring manager call you back?</h1>
          <p className="mt-5 text-lg text-ink-2">
            Upload your CV and pick the role you&apos;re going for. In about 30 seconds you get a score out of 100, what already works, and 5 fixes, each with a rewrite of
            your own line.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-2">
            <li className="border-l-2 border-accent pl-4">Judged the way sales leaders read CVs: quota, pipeline, deal size, segment and team results.</li>
            <li className="border-l-2 border-accent pl-4">Never makes up numbers. Where one is missing, it shows a gap like [X%] for you to fill.</li>
            <li className="border-l-2 border-accent pl-4">Your CV is read once and not kept. We keep your email and score only.</li>
          </ul>
        </section>

        <form
          className="card h-fit p-7"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const file = data.get("cv");
            if (!(file instanceof File) || !file.size) return setError("Choose your CV file.");
            setBusy(true);
            setError("");
            try {
              setResult(
                await review({ email: String(data.get("email")), role: String(data.get("role")), fileName: file.name, file: await file.arrayBuffer() }),
              );
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : "Something went wrong. Try again in a minute.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="display text-2xl">Review my CV</h2>
          <label className="mt-6 block">
            <span className="label">Your CV (PDF or Word)</span>
            <input name="cv" type="file" accept=".pdf,.docx" required className="field mt-1 file:mr-3 file:rounded file:border-0 file:bg-line file:px-3 file:py-1 file:text-ink" />
          </label>
          <label className="mt-4 block">
            <span className="label">Role you&apos;re going for</span>
            <select name="role" className="field mt-1" defaultValue="Account Executive">
              {REVIEW_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="email" className="field mt-1" />
          </label>
          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
          <button className="btn btn-primary mt-6 w-full justify-center" disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Reading your CV…" : "Get my free review"}
          </button>
          <p className="mt-4 text-xs text-ink-3">One free review per email.</p>
        </form>
      </div>

      {result && <Result review={result} />}

      <nav className="mt-16 flex flex-wrap gap-4 border-t border-line pt-6 text-xs text-ink-3">
        <Link href="/">Home</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </div>
  );
}

function Result({ review }: { review: Review }) {
  const tone = review.score >= 75 ? "text-good" : review.score >= 50 ? "text-ink" : "text-bad";
  return (
    <section className="mt-16 border-t border-line pt-12">
      <div className="flex flex-wrap items-end gap-6">
        <div className={`display text-7xl ${tone}`}>
          {review.score}
          <span className="text-2xl text-ink-3">/100</span>
        </div>
        <p className="max-w-xl pb-2 text-lg">{review.verdict}</p>
      </div>

      {review.strengths.length > 0 && (
        <>
          <h2 className="display mt-12 text-2xl">What already works</h2>
          <ul className="mt-4 space-y-2 text-ink-2">
            {review.strengths.map((s) => (
              <li key={s} className="border-l-2 border-good pl-4">
                {s}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="display mt-12 text-2xl">5 fixes, most important first</h2>
      <ol className="mt-6 space-y-6">
        {review.fixes.map((f, i) => (
          <li key={f.what} className="card p-6">
            <div className="flex gap-4">
              <span className="display text-2xl text-accent">{i + 1}</span>
              <div>
                <p className="font-medium">{f.what}</p>
                <p className="mt-1 text-sm text-ink-2">{f.why}</p>
                {f.example && <p className="mt-3 rounded bg-line/60 px-4 py-3 text-sm">{f.example}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {review.missing.length > 0 && (
        <>
          <h2 className="display mt-12 text-2xl">What recruiters look for that&apos;s missing</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {review.missing.map((m) => (
              <span key={m} className="rounded-full border border-line px-3 py-1 text-sm text-ink-2">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="card mt-14 p-8">
        <h2 className="display text-2xl">Fixed it? Want it re-checked, and tailored for every job?</h2>
        <p className="mt-2 text-ink-2">
          Re-checks after each change, a CV tailored to every job description, and who you know at each company come with JobPipe.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Join the waitlist
        </Link>
      </div>
    </section>
  );
}
