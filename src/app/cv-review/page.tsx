"use client";

import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { REVIEW_ROLES, type Review } from "../../../convex/lib/cvReview";
import { Spinner } from "@/components/ui";
import { regionsOf } from "@/lib/regions";
import { backOffice, titleMatches } from "../../../convex/lib/salesRoles";
import { strongCompany } from "../../../convex/lib/quickFit";
import { PublicHeader } from "@/components/PublicHeader";

/** Titles searched for each review role, so the review can end with real open roles in India. */
const ROLE_TITLES: Record<string, string[]> = {
  "SDR / BDR": ["SDR", "BDR", "Sales Development Representative", "Business Development Representative"],
  "SDR / BDR leadership": ["SDR Manager", "Sales Development Manager", "Head of Sales Development"],
  "Account Executive": ["Account Executive", "Enterprise Account Executive", "Mid Market Account Executive"],
  "Sales leadership": ["Head of Sales", "Sales Director", "VP Sales", "Regional Sales Manager"],
  "GTM strategy / AI GTM": ["GTM", "Go To Market", "Revenue Operations", "Sales Operations"],
  "Founder's Office": ["Founder's Office", "Chief of Staff", "Founders Office"],
  "Customer Success / Account Management": ["Customer Success Manager", "Account Manager"],
};

/** The free CV review: no account, one per email. The CV is read once and not kept. */
export default function CvReview() {
  const review = useAction(api.cvReview.review);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Review | null>(null);
  const [role, setRole] = useState("Account Executive");

  return (
    <div className="mx-auto max-w-5xl px-5 pb-12 lg:px-12">
      <PublicHeader />

      <div className="mt-6 grid gap-12 lg:grid-cols-[1.1fr_1fr]">
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
            <select name="role" className="field mt-1" value={role} onChange={(e) => setRole(e.target.value)}>
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

      {result && <Result review={result} role={role} />}

      <nav className="mt-16 flex flex-wrap gap-4 border-t border-line pt-6 text-xs text-ink-3">
        <Link href="/">Home</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </div>
  );
}

const DAY = 86_400_000;

/**
 * Real open roles for the role they picked, in India or remote, newest and best-known companies first.
 * 14 of the first 18 reviewers never signed up (17 Nov): the review ended with a generic pitch and no jobs.
 */
function OpenRoles({ role }: { role: string }) {
  const titles = ROLE_TITLES[role] ?? ROLE_TITLES["Account Executive"];
  const rows = useQuery(api.careers.forGuide, { titles: titles.slice(0, 4), india: true });
  // Fixed when the list first shows, so the render stays pure.
  const [now] = useState(() => Date.now());
  if (!rows) return null;
  const seen = new Set<string>();
  const fit = rows
    .filter((j) => titles.some((t) => titleMatches(t, j.title)) && !backOffice(j.title))
    .filter((j) => regionsOf(j).some((r) => r === "india" || r === "blr" || r === "remote"))
    .filter((j) => !j.postedAt || now - Date.parse(j.postedAt) < 30 * DAY)
    .filter((j) => !seen.has(`${j.company}|${j.title}`) && !!seen.add(`${j.company}|${j.title}`));
  if (fit.length < 3) return null;
  const top = [...fit]
    .sort((a, b) => Number(strongCompany(b.company)) - Number(strongCompany(a.company)) || (Date.parse(b.postedAt ?? "") || 0) - (Date.parse(a.postedAt ?? "") || 0))
    .slice(0, 5);
  return (
    <div className="card mt-14 p-8">
      <h2 className="display text-2xl">
        {fit.length} {role} roles open in India right now
      </h2>
      <ul className="mt-5 divide-y divide-line">
        {top.map((j) => (
          <li key={j.externalId} className="py-3">
            <p className="font-medium">{j.title}</p>
            <p className="text-sm text-ink-2">
              {j.company} · {j.location}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-ink-2">See all of them, how well your CV fits each one, and a CV tailored to the ones worth applying to. Free to start.</p>
      <Link href="/" className="btn btn-primary mt-6">
        See my matching jobs
      </Link>
    </div>
  );
}

function Result({ review, role }: { review: Review; role: string }) {
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

      <OpenRoles role={role} />

      <div className="card mt-14 p-8">
        <h2 className="display text-2xl">Fixed it? Want it re-checked, and tailored for every job?</h2>
        <p className="mt-2 text-ink-2">
          Re-checks after each change, a CV tailored to every job description, and a quick way to find who you know at each company come with JobPipe.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Start your free trial
        </Link>
      </div>
    </section>
  );
}
