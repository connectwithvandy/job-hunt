// What JobPipe costs. The pricing page, the terms and the checkout all read these, so a change here changes all of them.

export const PLANS = {
  trialDays: 7,
  full: 999,
  founding: 499,
  foundingSeats: 50,
  /** The Job Hunt Pass: one payment for 3 months, no auto-renewal. */
  passMonths: 3,
  pass: 2499,
  foundingPass: 1299,
  /** Group seats for sales communities, bootcamps and outplacement, per seat per month. */
  seat: 599,
  minSeats: 10,
};

export type PlanKey = "month" | "pass";

/** Rupees and days for one purchase. Founding prices for the first 50 paying people, kept as long as they stay. */
export function priceOf(plan: PlanKey, founding: boolean) {
  if (plan === "pass") return { rupees: founding ? PLANS.foundingPass : PLANS.pass, days: PLANS.passMonths * 30, label: `${PLANS.passMonths}-month Job Hunt Pass` };
  return { rupees: founding ? PLANS.founding : PLANS.full, days: 30, label: "1 month" };
}
