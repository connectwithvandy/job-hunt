"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { CITY_CHOICES } from "../../convex/lib/defaults";
import { errorMessage } from "@/lib/errors";
import { MAX, searchTitle, TITLES } from "./JobsByEmail";
import { Spinner } from "./ui";

type Top = { title: string; company: string; where: string; url: string; match: string; fit: number };

/** Before signing up: a CV and the titles you want in, your five best open sales jobs today out. No account, no AI. */
export function CvTopJobs() {
  const topJobs = useAction(api.cvTopJobs.topJobs);
  const subscribe = useMutation(api.subscribers.subscribe);
  const [picked, setPicked] = useState<string[]>([]);
  const [place, setPlace] = useState("Bengaluru");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ jobs: Top[]; looked: number } | null>(null);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"" | "busy" | "done" | string>("");

  const titles = picked.map(searchTitle);
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length >= MAX ? p : [...p, t]));

  return (
    <section id="top-jobs" className="card scroll-mt-24 p-6 md:p-8">
      <p className="label text-accent">Free, no sign-up</p>
      <h2 className="display mt-2 text-3xl leading-tight">See your top 5 sales jobs today</h2>
      <p className="mt-2 text-sm text-ink-2">Pick what you&apos;re looking for and add your CV. We match it against today&apos;s open roles from company careers pages. Your CV is read once and not kept.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (!titles.length) return setError("Pick at least one job title.");
          if (!file) return setError("Add your CV (PDF or Word).");
          setBusy(true);
          setResult(null);
          try {
            setResult(await topJobs({ fileName: file.name, file: await file.arrayBuffer(), titles, location: place }));
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">Job titles (up to {MAX})</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TITLES.map((t) => {
              const on = picked.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-line text-ink-2 hover:border-accent"}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Where
            <select className="field mt-1" value={place} onChange={(e) => setPlace(e.target.value)}>
              {CITY_CHOICES.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option value="India">Anywhere in India</option>
              <option value="Remote">Remote</option>
            </select>
          </label>
          <label className="block min-w-0 text-sm font-medium">
            Your CV
            <input
              className="field mt-1 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-soft file:px-3 file:py-1 file:text-sm"
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Matching your CV…" : "Show my top 5"}
        </button>
      </form>

      {result && (
        <div className="mt-8" aria-live="polite">
          {result.jobs.length ? (
            <>
              <p className="text-sm text-ink-2">
                Best {result.jobs.length} of {result.looked} open {result.looked === 1 ? "role" : "roles"} for your titles. A quick first guess from your CV&apos;s words, the title and the place.
              </p>
              <ol className="mt-3 divide-y divide-line rounded-xl border border-line">
                {result.jobs.map((j) => (
                  <li key={j.url} className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <a href={j.url} target="_blank" rel="nofollow noopener" className="font-medium hover:text-accent">
                        {j.title}
                      </a>
                      <p className="text-sm text-ink-2">
                        {j.company} · {j.where}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${j.fit >= 70 ? "bg-accent text-on-accent" : "border border-line text-ink-2"}`}>{j.match}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-sm text-ink-2">Nothing open right now for those titles there. Try another city or title, or get new ones by email below.</p>
          )}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="font-medium">Want every job scored and your CV tailored?</p>
              <p className="mt-1 text-sm text-ink-2">A free account scores each role against your CV with the reasons, and writes a tailored CV in one click. 7 days of everything, then a free plan.</p>
              <a href="#join" className="btn btn-primary btn-sm mt-3">
                Sign up free
              </a>
            </div>
            <form
              className="rounded-xl border border-line p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setEmailState("busy");
                try {
                  await subscribe({ email, titles, location: place });
                  setEmailState("done");
                } catch (err) {
                  setEmailState(errorMessage(err));
                }
              }}
            >
              <p className="font-medium">Or get new ones by email, daily</p>
              {emailState === "done" ? (
                <p className="mt-2 text-sm text-good">Done. The first email is on its way, with a one-click unsubscribe.</p>
              ) : (
                <>
                  <input className="field mt-2 text-sm" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  {emailState && emailState !== "busy" && <p className="mt-1 text-xs text-bad">{emailState}</p>}
                  <button className="btn btn-ghost btn-sm mt-2" disabled={emailState === "busy"}>
                    Email me new jobs
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
