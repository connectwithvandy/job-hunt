// What JobPipe costs. The pricing page, the terms and the checkout all read these, so a change here changes all of them.

export const PLANS = {
  trialDays: 7,
  full: 999,
  founding: 499,
  /** Founding price for the next 50 payers (17 Nov 2026: 0 had paid). */
  foundingSeats: 50,
  /** The Job Hunt Pass: one payment for 3 months, no auto-renewal. */
  passMonths: 3,
  pass: 1499,
  foundingPass: 999,
  /** The Week Pass: 7 days of every AI tool, one payment, no auto-renewal. No founding price: it's already small. */
  week: 349,
  weekDays: 7,
  /** Group seats for sales communities, bootcamps and outplacement, per seat per month. */
  seat: 599,
  minSeats: 10,
};

export type PlanKey = "week" | "month" | "pass";

/**
 * What can be bought. Since 17 Nov 2026 only the Job Hunt Pass: a job hunt lasts months, and one clear offer beats four.
 * "week" and "month" stay as types so older payment rows still read.
 */
export const OFFERED: PlanKey[] = ["pass"];

/** Rupees and days for one purchase. Founding prices for the first few paying people (PLANS.foundingSeats), kept as long as they stay. */
export function priceOf(plan: PlanKey, founding: boolean) {
  if (plan === "week") return { rupees: PLANS.week, days: PLANS.weekDays, label: "Week Pass" };
  if (plan === "pass") return { rupees: founding ? PLANS.foundingPass : PLANS.pass, days: PLANS.passMonths * 30, label: `${PLANS.passMonths}-month Job Hunt Pass` };
  return { rupees: founding ? PLANS.founding : PLANS.full, days: 30, label: "1 month" };
}

/**
 * The price to show struck through next to `priceOf`, so a lower price reads as a discount off the one real price:
 * founding prices against the full price. Null when there's no saving.
 */
export function wasOf(plan: PlanKey, founding: boolean) {
  if (plan === "week") return null;
  const now = priceOf(plan, founding).rupees;
  const was = founding ? priceOf(plan, false).rupees : null;
  return was && was > now ? { rupees: was, percentOff: Math.round((1 - now / was) * 100) } : null;
}

/**
 * The free plan: what everyone keeps once the trial ends without a payment. Daily jobs, the tracker and the
 * free fit guess cost no AI and stay open; these are the AI allowances on top. Everything else needs a pass.
 */
export const FREE = {
  scoresPerDay: 5,
  tailorsPerWeek: 1,
  addedJobsPerDay: 2,
};

/** Words in every "this needs a pass" message; the app spots them and shows a "Get the Job Hunt Pass" button. */
export const PAYWALL_MARK = "Job Hunt Pass";
