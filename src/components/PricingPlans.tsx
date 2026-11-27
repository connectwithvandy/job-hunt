"use client";

import Link from "next/link";
import { PLANS } from "../../convex/lib/plans";
import { PlanCards } from "@/components/PlanCards";

const off = (now: number, was: number) => ({ rupees: was, percentOff: Math.round((1 - now / was) * 100) });

/**
 * The plans on /pricing, the same cards as Billing. Signed-out visitors see founding prices; the real count of
 * founding places left is on Billing, which knows who is asking.
 */
export function PricingPlans() {
  return (
    <div className="text-ink">
      <PlanCards
        prices={{
          month: { rupees: PLANS.founding, was: off(PLANS.founding, PLANS.full) },
          pass: { rupees: PLANS.foundingPass, was: off(PLANS.foundingPass, PLANS.pass) },
        }}
        founding={`Founding prices for the first ${PLANS.foundingSeats} paying members, kept for as long as they stay.`}
        freeAction={
          <Link href="/" className="btn btn-secondary w-full justify-center">
            Start free
          </Link>
        }
        action={(key) => (
          // One lime button on the page: the plan most people pick.
          <Link href="/billing" className={`btn w-full justify-center ${key === "pass" ? "btn-primary" : "btn-secondary"}`}>
            {key === "pass" ? `Get ${PLANS.passMonths} months` : "Get 1 month"}
          </Link>
        )}
      />
      <p className="mt-4 text-[13px] text-ink-3">Have a partner or promo code? Add it on Plan &amp; billing after you sign in.</p>
    </div>
  );
}
