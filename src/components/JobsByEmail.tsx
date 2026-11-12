"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { CITY_CHOICES } from "../../convex/lib/defaults";
import { errorMessage } from "@/lib/errors";

/** The titles most sales people search for; anything else goes in the box. */
const TITLES = ["SDR / BDR", "SDR Manager", "Account Executive", "Enterprise Account Executive", "Account Manager", "Sales Manager", "Head of Sales", "Customer Success Manager"];
const MAX = 3;

/** "SDR / BDR" is a menu label; the search reads it as the full title. */
const searchTitle = (t: string) => (t === "SDR / BDR" ? "Sales Development Representative" : t);

/** Daily sales jobs by email, no account needed: up to 3 titles, one place, an email. */
export function JobsByEmail({ heading = "Get new sales jobs by email", compact = false }: { heading?: string; compact?: boolean }) {
  const subscribe = useMutation(api.subscribers.subscribe);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [place, setPlace] = useState("Bengaluru");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const titles = [...picked.map(searchTitle), ...(other.trim() ? [other.trim()] : [])];
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length + (other.trim() ? 1 : 0) >= MAX ? p : [...p, t]));

  if (done) {
    return (
      <section className="card p-6" aria-live="polite">
        <h2 className="display text-2xl">You&apos;re signed up</h2>
        <p className="mt-2 text-ink-2">The first email is on its way to {email.trim()}. After that, new jobs once a day, and every email has a one-click unsubscribe.</p>
      </section>
    );
  }

  return (
    <section className={`card ${compact ? "p-5" : "p-6 md:p-8"}`}>
      <h2 className="display text-2xl">{heading}</h2>
      <p className="mt-2 text-sm text-ink-2">Fresh roles from company careers pages, once a day. No account, no CV needed.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (!titles.length) return setError("Pick at least one job title.");
          setBusy(true);
          try {
            await subscribe({ email, titles, location: place });
            setDone(true);
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
          <input
            className="field mt-2 text-sm"
            placeholder="Or type another title"
            maxLength={60}
            value={other}
            disabled={!other && picked.length >= MAX}
            onChange={(e) => setOther(e.target.value)}
          />
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
          <label className="block text-sm font-medium">
            Your email
            <input className="field mt-1" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Signing you up…" : "Email me new jobs"}
        </button>
      </form>
    </section>
  );
}
