import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
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
  notes: "notes and messages (referral notes, Find & write note, Personalise)",
  addJob: "added jobs",
  research: "company lookups",
  prep: "interview preps",
  chat: "chat messages",
  search: "job searches",
};

/** Spend `count` of today's allowance, or throw a friendly error. The owner has no limit. */
export const consume = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("readCv"), v.literal("score"), v.literal("tailor"), v.literal("notes"), v.literal("addJob"), v.literal("research"), v.literal("prep"), v.literal("chat"), v.literal("search")),
    count: v.optional(v.number()),
  },
  handler: async (ctx, { userId, kind, count }) => {
    const user = await ctx.db.get("users", userId);
    if (isOwnerEmail(user?.email)) return null;
    const { ok, retryAfter } = await rateLimiter.limit(ctx, kind, { key: userId, count: count ?? 1 });
    if (!ok) {
      const hours = Math.max(1, Math.ceil(retryAfter / HOUR));
      throw new ConvexError(`You've used today's ${DAILY_LIMITS[kind]} ${LABELS[kind]}. More in about ${hours} ${hours === 1 ? "hour" : "hours"}.`);
    }
    return null;
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
