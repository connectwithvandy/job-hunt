// What a paid plan adds over the free plan, read from the real daily limits so the cards can't promise more
// than the app allows. Shown on Billing and Pricing (19 Nov: 0 paid, and the paid cards only said "every tool").
import { DAILY_LIMITS } from "../../convex/lib/defaults";
import { FREE } from "../../convex/lib/plans";

// Short lines: they sit once under both paid cards, two columns wide.
export const PAID_ADDS: string[] = [
  `${DAILY_LIMITS.score} full fit scores a day · free has ${FREE.scoresPerDay}`,
  `${DAILY_LIMITS.tailor} tailored CVs + cover letters a day · free has ${FREE.tailorsTotal} in total`,
  "Referral and hiring-manager notes",
  "Answers to application form questions",
  "Interview prep and call scripts",
  "Ask JobPipe chat and company research",
];
