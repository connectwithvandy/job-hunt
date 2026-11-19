// What a paid plan adds over the free plan, read from the real daily limits so the cards can't promise more
// than the app allows. Shown on Billing and Pricing (19 Nov: 0 paid, and the paid cards only said "every tool").
import { DAILY_LIMITS } from "../../convex/lib/defaults";
import { FREE } from "../../convex/lib/plans";

export const PAID_ADDS: string[] = [
  `${DAILY_LIMITS.score} real fit scores a day (free: ${FREE.scoresPerDay})`,
  `${DAILY_LIMITS.tailor} tailored CVs and cover letters a day (free: ${FREE.tailorsTotal} in total)`,
  "Referral notes, hiring-manager messages and answers to form questions",
  "Interview prep and a call script for every job",
  "Company research and Ask JobPipe, the chat",
];
