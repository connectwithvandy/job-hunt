import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import { env, internalMutation, type QueryCtx } from "./_generated/server";
import { isOwnerEmail } from "./lib/auth";
import { DAILY_LIMITS } from "./lib/defaults";

const DAY = 24 * HOUR;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  readCv: { kind: "fixed window", rate: DAILY_LIMITS.readCv, period: DAY },
  score: { kind: "fixed window", rate: DAILY_LIMITS.score, period: DAY },
  tailor: { kind: "fixed window", rate: DAILY_LIMITS.tailor, period: DAY },
  notes: { kind: "fixed window", rate: DAILY_LIMITS.notes, period: DAY },
  addJob: { kind: "fixed window", rate: DAILY_LIMITS.addJob, period: DAY },
  research: { kind: "fixed window", rate: DAILY_LIMITS.research, period: DAY },
  prep: { kind: "fixed window", rate: DAILY_LIMITS.prep, period: DAY },
  chat: { kind: "fixed window", rate: DAILY_LIMITS.chat, period: DAY },
  search: { kind: "fixed window", rate: DAILY_LIMITS.search, period: DAY },
});

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
};

/**
 * Spend `count` of today's allowance, or throw a friendly error. The owner has no limit.
 * With `checkOnly`, only makes sure it's there, so slow AI work can spend it after it succeeds.
 */
export const consume = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("readCv"), v.literal("score"), v.literal("tailor"), v.literal("notes"), v.literal("addJob"), v.literal("research"), v.literal("prep"), v.literal("chat"), v.literal("search")),
    count: v.optional(v.number()),
    checkOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, kind, count, checkOnly }) => {
    const user = await ctx.db.get("users", userId);
    if (isOwnerEmail(user?.email)) return null;
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
    const user = await ctx.db.get("users", userId);
    // Everyone let in, plus the owner, who never needs a waitlist row (counted once even if they have one).
    const approved = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(500);
    const people = approved.filter((a) => !isOwnerEmail(a.email)).length + 1;
    const share = isOwnerEmail(user?.email) ? budget : Math.floor(budget / people);
    const granted = Math.max(0, Math.min(want, budget - used, share - (mine?.count ?? 0)));
    if (!granted) return 0;
    if (mine) await ctx.db.patch("googleUsage", mine._id, { count: mine.count + granted });
    else await ctx.db.insert("googleUsage", { month, userId, count: granted });
    return granted;
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
