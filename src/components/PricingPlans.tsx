"use client";

import { useState } from "react";
import { PLANS } from "../../convex/lib/plans";

/** The paid plans on /pricing behind a 1 month / 3 months switch, 3 months picked first (the better deal). */
export function PricingPlans() {
  const [plan, setPlan] = useState<"month" | "pass">("pass");
  const monthly = Math.round(PLANS.foundingPass / PLANS.passMonths);
  const saving = Math.round((1 - monthly / PLANS.founding) * 100);
  return (
    <div className="card p-6 text-ink">
      <div role="radiogroup" aria-label="Plan length" className="mb-5 inline-flex rounded-full border border-line p-1 text-sm">
        {(
          [
            ["month", "1 month"],
            ["pass", `${PLANS.passMonths} months`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={plan === key}
            onClick={() => setPlan(key)}
            className={`rounded-full px-4 py-1.5 ${plan === key ? "bg-accent font-medium text-on-accent" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
            {key === "pass" && <span className="ml-2 text-xs">save {saving}% a month</span>}
          </button>
        ))}
      </div>
      {plan === "month" ? (
        <>
          <div className="label">1 month</div>
          <Price now={PLANS.founding} was={PLANS.full} />
          <p className="mt-2 text-sm text-ink-2">
            Every AI tool for one month, to try it during a busy month of applying. One payment, no auto-renewal. Founding price for the next {PLANS.foundingSeats}{" "}
            members; ₹{PLANS.full} after that.
          </p>
        </>
      ) : (
        <>
          <div className="label">Job Hunt Pass, {PLANS.passMonths} months</div>
          <Price now={PLANS.foundingPass} was={PLANS.pass} />
          <p className="mt-2 text-sm text-ink-2">
            Every AI tool for {PLANS.passMonths} months, a typical search: ₹{monthly} a month. One payment, no auto-renewal. Founding price for the next {PLANS.foundingSeats}{" "}
            members; ₹{PLANS.pass.toLocaleString("en-IN")} after that.
          </p>
        </>
      )}
      <p className="mt-3 text-xs text-ink-3">Have a partner or promo code? Add it on Plan &amp; billing after you sign in.</p>
    </div>
  );
}

/** A price as a discount off the one real price: the full price struck through, then the offer. */
function Price({ now, was }: { now: number; was: number }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
      <s className="text-xl text-ink-3">₹{was.toLocaleString("en-IN")}</s>
      <span className="display text-4xl">₹{now.toLocaleString("en-IN")}</span>
      <span className="text-base text-ink-2">once</span>
      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">{Math.round((1 - now / was) * 100)}% off</span>
    </div>
  );
}
