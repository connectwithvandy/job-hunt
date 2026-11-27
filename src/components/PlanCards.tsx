"use client";

import type { ReactNode } from "react";
import { FREE, PLANS } from "../../convex/lib/plans";
import { PAID_ADDS } from "@/lib/paidFeatures";

type Price = { rupees: number; was?: { rupees: number; percentOff: number } | null };
type PaidKey = "month" | "pass";

/**
 * Free, 1 month and 3 months side by side, the same on Pricing and Billing (19 Nov: the owner found the old cards long,
 * with the same five lines on both paid cards and nothing saying which to pick). Each card stays short; what paid adds
 * is listed once underneath, and the 3-month card is marked as the better deal.
 */
export function PlanCards({
  prices,
  founding,
  freeAction,
  action,
  note,
  narrow,
}: {
  prices: Record<PaidKey, Price>;
  /** One line under the paid prices, e.g. how many founding places are left. */
  founding?: ReactNode;
  freeAction: ReactNode;
  /** The button at the bottom of a paid card. */
  action: (key: PaidKey) => ReactNode;
  /** Extra line on a paid card, e.g. what a promo code does to its price. */
  note?: (key: PaidKey) => ReactNode;
  /** In a narrow column (Pricing): the two paid cards side by side, Free across the full width under them. */
  narrow?: boolean;
}) {
  const perMonth = Math.round(prices.pass.rupees / PLANS.passMonths);
  const paid: { key: PaidKey; name: string; who: string; extra?: string; best?: boolean }[] = [
    { key: "month", name: "1 month", who: "To try every tool during a busy month." },
    { key: "pass", name: `${PLANS.passMonths} months`, who: "A typical job search, start to offer.", extra: `₹${perMonth} a month`, best: true },
  ];
  // 27 Nov review: Free, 1 month and 3 months side by side everywhere (Pricing stacked Free under the others), what each
  // gives in plain words on the card, the founding offer said once above the prices, and lime only on the one main button.
  void narrow;
  return (
    <div>
      {founding && <p className="mb-4 text-[15px] font-semibold text-ink">{founding}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card flex flex-col p-6">
          <h2 className="h2">Free</h2>
          <p className="display mt-3 text-4xl">₹0</p>
          <p className="mt-1 text-[13px] text-ink-3">Yours to keep, no card needed.</p>
          <h3 className="mt-5 text-[13px] font-semibold text-ink-2">What you get</h3>
          <ul className="mt-2 space-y-1.5 text-[15px] text-ink-2">
            <li>New sales jobs every day</li>
            <li>A rough fit guess on every job</li>
            <li>{FREE.scoresPerDay} full fit scores a day</li>
            <li>{FREE.tailorsTotal} tailored CV to try</li>
            <li>Your application tracker</li>
          </ul>
          <div className="mt-auto pt-6">{freeAction}</div>
        </section>
        {paid.map(({ key, name, who, extra, best }) => {
          const p = prices[key];
          return (
            <section key={key} className={`card relative flex flex-col p-6 ${best ? "ring-2 ring-ink" : ""}`}>
              {best && <span className="mono absolute -top-3 left-6 rounded-full bg-ink px-3 py-1 !text-paper">Best value</span>}
              <h2 className="h2">{name}</h2>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                <span className="display tnum text-4xl">₹{p.rupees.toLocaleString("en-IN")}</span>
                {p.was && <s className="tnum text-lg text-ink-3">₹{p.was.rupees.toLocaleString("en-IN")}</s>}
                {p.was && <span className="tnum rounded-full bg-soft px-2 py-0.5 text-[13px] font-semibold text-ink">{p.was.percentOff}% off</span>}
              </p>
              <p className="mt-1 text-[13px] text-ink-3">
                One payment{extra ? `, ${extra}` : ""}. Nothing renews.
              </p>
              <p className="mt-4 text-[15px] text-ink">{who}</p>
              <h3 className="mt-5 text-[13px] font-semibold text-ink-2">What you get</h3>
              <ul className="mt-2 space-y-1.5 text-[15px] text-ink-2">
                <li>Everything in Free</li>
                <li>{PAID_ADDS[0].split(" · ")[0]}</li>
                <li>{PAID_ADDS[1].split(" · ")[0]}</li>
                <li>Every AI tool, listed below</li>
              </ul>
              {note?.(key)}
              <div className="mt-auto pt-6">{action(key)}</div>
            </section>
          );
        })}
      </div>
      <section className="card mt-4 p-6">
        <h3 className="h2">Both paid plans include</h3>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] text-ink-2 sm:grid-cols-2">
          {PAID_ADDS.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-ink">✓</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
