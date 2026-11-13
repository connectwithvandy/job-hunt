import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import { env, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { DAILY_LIMITS } from "./lib/defaults";
import { FREE, PAYWALL_MARK, PLANS } from "./lib/plans";
import { trialOver } from "./lib/trial";

const DAY = 24 * HOUR;

/** What the free plan keeps once the trial is over: searching and CV uploads as usual, plus small AI allowances. */
const OPEN_AFTER_TRIAL: string[] = ["search", "readCv"];
const FREE_ALLOWANCE = { score: "freeScore", tailor: "freeTailor", addJob: "freeAddJob" } as const;

/** What each paid-only tool is called in the "needs a pass" message. */
const PAID_ONLY: Record<string, string> = {
  notes: "Referral notes, messages and quick writing",
  research: "Company research",
  prep: "Interview prep",
  chat: "The chat",
  findEmail: "Finding emails",
};
const passLine = `Get the ${PAYWALL_MARK} (₹${PLANS.week} for 7 days) to turn every AI tool back on.`;

export const FRESH_ALERTS_A_DAY = 40;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  readCv: { kind: "fixed window", rate: DAILY_LIMITS.readCv, period: DAY },
  score: { kind: "fixed window", rate: DAILY_LIMITS.score, period: DAY },
  tailor: { kind: "fixed window", rate: DAILY_LIMITS.tailor, period: DAY },
  notes: { kind: "fixed window", rate: DAILY_LIMITS.notes, period: DAY },
  addJob: { kind: "fixed window", rate: DAILY_LIMITS.addJob, period: DAY },
  research: { kind: "fixed window", rate: DAILY_LIMITS.research, period: DAY },
  prep: { kind: "fixed window", rate: DAILY_LIMITS.prep, period: DAY },
  chat: { kind: "fixed window", rate: DAILY_LIMITS.chat, period: DAY },
  search: { kind: "fixed window", rate: DAILY_LIMITS.search, period: DAY },
  findEmail: { kind: "fixed window", rate: DAILY_LIMITS.findEmail, period: DAY },
  // The free plan, after the trial: on top of the daily limits above.
  freeScore: { kind: "fixed window", rate: FREE.scoresPerDay, period: DAY },
  freeTailor: { kind: "fixed window", rate: FREE.tailorsPerWeek, period: 7 * DAY },
  freeAddJob: { kind: "fixed window", rate: FREE.addedJobsPerDay, period: DAY },
  // The free CV review on /cv-review, for everyone together: caps what strangers can spend on AI in a day.
  freeReview: { kind: "fixed window", rate: 30, period: DAY },
  // Sign-ups to the jobs email without an account, for everyone together: stops a script filling the list with strangers.
  subscribe: { kind: "fixed window", rate: 100, period: DAY },
  // "Your top 5 jobs" from a CV on the homepage, for everyone together. No AI, but each one reads a file and many roles.
  cvTop: { kind: "fixed window", rate: 300, period: DAY },
  // Error reports from browsers: enough to spot a real crash, not enough for a loop to flood the table.
  appError: { kind: "fixed window", rate: 30, period: DAY },
  /** Fresh job alerts for the whole app, leaving room in the email plan's daily limit for everything else. */
  freshAlert: { kind: "fixed window", rate: FRESH_ALERTS_A_DAY, period: DAY },
});

/** What the free plan says when its allowance is used up. */
const FREE_USED: Record<(typeof FREE_ALLOWANCE)[keyof typeof FREE_ALLOWANCE], string> = {
  freeScore: `The free plan scores ${FREE.scoresPerDay} jobs a day, and today's are used.`,
  freeTailor: `The free plan writes ${FREE.tailorsPerWeek} tailored CV a week, and this week's is used.`,
  freeAddJob: `The free plan adds ${FREE.addedJobsPerDay} jobs a day by hand, and today's are used.`,
};

const LABELS: Record<keyof typeof DAILY_LIMITS, string> = {
  readCv: "CV uploads",
  score: "job scores",
  tailor: "tailored CVs",
  notes: "notes and quick writing (referral notes, messages, questions before a CV, Fill from my CV)",
  addJob: "added jobs",
  research: "company lookups",
  prep: "interview preps",
  chat: "chat messages",
  search: "job searches",
  findEmail: "email lookups",
};

/**
 * What each kind of AI work counts for against the whole app's daily limit, roughly by what it costs:
 * a job score on Sonnet is 1, a tailored CV and letter on Opus is 15. Kinds not listed use no AI.
 */
const AI_UNITS: Partial<Record<keyof typeof LABELS, number>> = { readCv: 1, score: 1, addJob: 1, notes: 2, chat: 2, research: 5, prep: 5, tailor: 15 };

/**
 * The whole app's daily AI limit, so a bug or a busy day can't run up a big bill. A unit is roughly $0.01
 * (one job score); 800 is about $8 a day. Raise it with AI_DAILY_UNITS, no deploy needed.
 */
export const aiLimit = () => ({ kind: "fixed window" as const, rate: Number(env.AI_DAILY_UNITS ?? 800), period: DAY });

/**
 * Spend `count` of today's allowance, or throw a friendly error. The owner has no limit.
 * With `checkOnly`, only makes sure it's there, so slow AI work can spend it after it succeeds.
 */
export const consume = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("readCv"), v.literal("score"), v.literal("tailor"), v.literal("notes"), v.literal("addJob"), v.literal("research"), v.literal("prep"), v.literal("chat"), v.literal("search"), v.literal("findEmail")),
    count: v.optional(v.number()),
    checkOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, kind, count, checkOnly }) => {
    const user = await ctx.db.get("users", userId);
    if (isOwnerEmail(user?.email)) return null;
    if (!OPEN_AFTER_TRIAL.includes(kind)) {
      const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
      if (trialOver(row, Date.now())) {
        const free = FREE_ALLOWANCE[kind as keyof typeof FREE_ALLOWANCE];
        if (!free) throw new ConvexError(`${PAID_ONLY[kind] ?? "This"} ${kind === "notes" ? "are" : "is"} part of the paid plan. ${passLine}`);
        const freeArgs = { key: userId, count: count ?? 1 };
        const { ok } = checkOnly ? await rateLimiter.check(ctx, free, freeArgs) : await rateLimiter.limit(ctx, free, freeArgs);
        if (!ok) throw new ConvexError(`${FREE_USED[free]} ${passLine}`);
      }
    }
    const units = (AI_UNITS[kind] ?? 0) * (count ?? 1);
    if (units) {
      const appArgs = { count: units, config: aiLimit() };
      const { ok } = checkOnly ? await rateLimiter.check(ctx, "appAi", appArgs) : await rateLimiter.limit(ctx, "appAi", appArgs);
      if (!ok) throw new ConvexError("JobPipe's AI tools have reached today's limit. They'll be back tomorrow, and job search still works.");
    }
    const args = { key: userId, count: count ?? 1 };
    const { ok, retryAfter } = checkOnly ? await rateLimiter.check(ctx, kind, args) : await rateLimiter.limit(ctx, kind, args);
    if (!ok) {
      const hours = Math.max(1, Math.ceil(retryAfter / HOUR));
      throw new ConvexError(`You've used today's ${DAILY_LIMITS[kind]} ${LABELS[kind]}. More in about ${hours} ${hours === 1 ? "hour" : "hours"}.`);
    }
    return null;
  },
});

// ---------- Google Jobs: one free monthly quota for everyone ----------

/**
 * Reserve up to `want` Google Jobs searches for this person this month; returns how many they got.
 * JSearch's free plan is one quota for the whole app (about 200 a month), so it's split evenly between
 * everyone let in. The owner can use what others leave, up to the total.
 */
export const reserveGoogle = internalMutation({
  args: { userId: v.id("users"), want: v.number() },
  handler: async (ctx, { userId, want }) => {
    const budget = Number(env.JSEARCH_MONTHLY ?? 190);
    const month = new Date().toISOString().slice(0, 7);
    const rows = await ctx.db.query("googleUsage").withIndex("by_month_userId", (q) => q.eq("month", month)).take(500);
    const used = rows.reduce((n, r) => n + r.count, 0);
    const mine = rows.find((r) => r.userId === userId);
    // Everyone let in, plus the owner, who never needs a waitlist row (counted once even if they have one).
    const approved = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(500);
    const people = approved.filter((a) => !isOwnerEmail(a.email)).length + 1;
    // The owner gets the same share as everyone: on 6 Nov their searches had used 128 of 190, leaving none for others.
    const share = Math.floor(budget / people);
    const granted = Math.max(0, Math.min(want, budget - used, share - (mine?.count ?? 0)));
    if (!granted) return 0;
    if (mine) await ctx.db.patch("googleUsage", mine._id, { count: mine.count + granted });
    else await ctx.db.insert("googleUsage", { month, userId, count: granted });
    return granted;
  },
});

/** Google Jobs searches used by everyone this month, and the month's budget, for the owner's service check. */
export const googleUsed = internalQuery({
  args: {},
  handler: async (ctx) => {
    const month = new Date().toISOString().slice(0, 7);
    const rows = await ctx.db.query("googleUsage").withIndex("by_month_userId", (q) => q.eq("month", month)).take(500);
    return { used: rows.reduce((n, r) => n + r.count, 0), budget: Number(env.JSEARCH_MONTHLY ?? 190) };
  },
});

// ---------- Hunter.io: one free monthly quota for everyone ----------

/** The most emails the whole app may find with Hunter.io this month; defaults to 25 (the free plan has 50 credits). */
export function hunterBudget() {
  const n = Number(env.HUNTER_MONTHLY ?? 25);
  return Number.isFinite(n) && n >= 0 ? n : 25;
}

/**
 * Holds one of this month's Hunter.io lookups before searching, so two people can't both take the last one.
 * Returns false when they're used up. Hand it back with releaseHunter if nothing was found (that costs Hunter nothing).
 * Applies to the owner too: it's the free plan's limit, not a per-person one.
 */
export const reserveHunter = internalMutation({
  args: {},
  handler: async (ctx) => {
    const month = new Date().toISOString().slice(0, 7);
    const row = await ctx.db.query("hunterUsage").withIndex("by_month", (q) => q.eq("month", month)).unique();
    if ((row?.count ?? 0) >= hunterBudget()) return false;
    if (row) await ctx.db.patch("hunterUsage", row._id, { count: row.count + 1 });
    else await ctx.db.insert("hunterUsage", { month, count: 1 });
    return true;
  },
});

/** Gives back a held lookup that found nothing. */
export const releaseHunter = internalMutation({
  args: {},
  handler: async (ctx) => {
    const month = new Date().toISOString().slice(0, 7);
    const row = await ctx.db.query("hunterUsage").withIndex("by_month", (q) => q.eq("month", month)).unique();
    if (row && row.count > 0) await ctx.db.patch("hunterUsage", row._id, { count: row.count - 1 });
    return null;
  },
});

/** True for people on the free plan: trial over, nothing paid. Lets AI extras skip quietly instead of failing. */
export const onFreePlan = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (isOwnerEmail(user?.email)) return false;
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    return trialOver(row, Date.now());
  },
});

// ---------- What's left today, for the page ----------

async function myKey(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Please sign in again.");
  return userId;
}

/** How many scores, tailored CVs and notes you have left today; the page shows them next to the buttons. */
export const { getRateLimit: scoresLeft, getServerTime } = rateLimiter.hookAPI<DataModel>("score", { key: myKey });
export const { getRateLimit: cvsLeft } = rateLimiter.hookAPI<DataModel>("tailor", { key: myKey });
export const { getRateLimit: notesLeft } = rateLimiter.hookAPI<DataModel>("notes", { key: myKey });

/** Takes one of today's homepage CV matches for everyone together; false when they're used up. */
export const takeCvTop = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await rateLimiter.limit(ctx, "cvTop")).ok,
});
