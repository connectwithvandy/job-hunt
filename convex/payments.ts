// Paying for JobPipe through Razorpay: Pay creates an order, Razorpay's checkout takes the money, and either the
// checkout's reply or Razorpay's webhook (whichever comes first) marks it paid. Off until the Razorpay keys are set.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isOwnerEmail, requireUserId } from "./lib/auth";
import { OFFERED, PLANS, priceOf, wasOf, type PlanKey } from "./lib/plans";
import { paymentGenuine } from "./lib/razorpay";

const DAY = 86_400_000;
const planV = v.union(v.literal("week"), v.literal("month"), v.literal("pass"));

const keys = () => (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? { id: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET } : null);

/** Whether this person pays founding prices: they already did, or fewer than PLANS.foundingSeats people have. */
export async function foundingFor(ctx: QueryCtx, userId: Id<"users">) {
  const people = await foundingPeople(ctx);
  return people.has(userId) || people.size < PLANS.foundingSeats;
}

/** Everyone who paid a founding price, read from one small index range. */
async function foundingPeople(ctx: QueryCtx) {
  const paid = await ctx.db.query("payments").withIndex("by_status_and_founding", (q) => q.eq("status", "paid").eq("founding", true)).take(500);
  return new Set(paid.map((p) => p.userId));
}

const tidyCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/** A code this person can use on this plan right now, or why not. */
async function promoFor(ctx: QueryCtx, userId: Id<"users">, rawCode: string, plan: PlanKey): Promise<{ error: string } | { error: null; row: Doc<"promoCodes"> }> {
  const code = tidyCode(rawCode);
  if (!code) return { error: "Type a code." };
  const row = await ctx.db.query("promoCodes").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (!row || !row.active) return { error: "That code doesn't work. Check the spelling." };
  if (row.expiresAt && row.expiresAt < Date.now()) return { error: "That code has expired." };
  if (row.uses >= row.maxUses) return { error: "That code has been used up." };
  if (plan === "week" || !row.plans.includes(plan)) return { error: `That code works on ${row.plans.map((x) => (x === "pass" ? "the 3-month pass" : "1 month")).join(" and ")} only.` };
  const mine = await ctx.db.query("payments").withIndex("by_userId", (q) => q.eq("userId", userId)).take(50);
  if (mine.some((m) => m.promo === code && m.status === "paid")) return { error: "You've already used this code." };
  return { error: null, row };
}

/** The price after a code: rounded to the rupee, never below zero. */
const afterPromo = (rupees: number, percentOff: number) => Math.max(0, Math.round((rupees * (100 - percentOff)) / 100));

/** What a code does to this person's price, for the Billing page to show before they pay. */
export const checkPromo = query({
  args: { code: v.string(), plan: planV },
  handler: async (ctx, { code, plan }) => {
    const userId = await requireUserId(ctx);
    const found = await promoFor(ctx, userId, code, plan);
    if (found.error !== null) return { ok: false as const, message: found.error };
    const founding = await foundingFor(ctx, userId);
    const rupees = afterPromo(priceOf(plan, founding).rupees, found.row.percentOff);
    return { ok: true as const, percentOff: found.row.percentOff, rupees, message: rupees === 0 ? `${found.row.percentOff}% off: free.` : `${found.row.percentOff}% off: ₹${rupees.toLocaleString("en-IN")}.` };
  },
});

export const promoFacts = internalQuery({
  args: { userId: v.id("users"), code: v.string(), plan: planV },
  handler: async (ctx, { userId, code, plan }) => {
    const found = await promoFor(ctx, userId, code, plan);
    return found.error !== null ? { error: found.error } : { code: found.row.code, percentOff: found.row.percentOff };
  },
});

/** Counts one use of a code (when its payment is paid, or straight away for a free one). */
async function countPromoUse(ctx: MutationCtx, code: string | undefined) {
  if (!code) return;
  const row = await ctx.db.query("promoCodes").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (row) await ctx.db.patch("promoCodes", row._id, { uses: row.uses + 1 });
}

/** A 100%-off code: turns the plan on with no payment, recorded like a paid order of ₹0. */
export const redeemFree = internalMutation({
  args: { userId: v.id("users"), plan: planV, code: v.string() },
  handler: async (ctx, { userId, plan, code }) => {
    const found = await promoFor(ctx, userId, code, plan);
    if (found.error !== null) throw new ConvexError(found.error);
    const orderId = `promo_${code}_${userId}_${Date.now()}`;
    await ctx.db.insert("payments", { userId, orderId, plan, amount: 0, founding: false, status: "created", promo: found.row.code });
    return await settlePaid(ctx, orderId, `promo:${code}`);
  },
});

async function requireOwnerCtx(ctx: QueryCtx) {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get("users", userId);
  if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can manage promo codes.");
}

/** Admin: every code with its uses. */
export const promoList = query({
  args: {},
  handler: async (ctx) => {
    await requireOwnerCtx(ctx);
    return await ctx.db.query("promoCodes").order("desc").take(100);
  },
});

/** Admin: make a code. */
export const createPromo = mutation({
  args: { code: v.string(), percentOff: v.number(), plans: v.array(v.union(v.literal("month"), v.literal("pass"))), maxUses: v.number(), days: v.optional(v.number()), note: v.string() },
  handler: async (ctx, a) => {
    await requireOwnerCtx(ctx);
    const code = tidyCode(a.code);
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new ConvexError("Use 3 to 30 letters or numbers, like SAASPIRE.");
    if (!(a.percentOff >= 1 && a.percentOff <= 100)) throw new ConvexError("The discount must be 1 to 100%.");
    if (!a.plans.length) throw new ConvexError("Pick at least one plan.");
    if (!(a.maxUses >= 1 && a.maxUses <= 1000)) throw new ConvexError("Uses must be 1 to 1,000.");
    if (await ctx.db.query("promoCodes").withIndex("by_code", (q) => q.eq("code", code)).unique()) throw new ConvexError("That code already exists.");
    const now = Date.now();
    await ctx.db.insert("promoCodes", {
      code,
      percentOff: Math.round(a.percentOff),
      plans: a.plans,
      maxUses: Math.round(a.maxUses),
      uses: 0,
      expiresAt: a.days ? now + a.days * DAY : undefined,
      note: a.note.trim().slice(0, 120),
      active: true,
      createdAt: now,
    });
    return code;
  },
});

/** Admin: switch a code off or back on. */
export const setPromoActive = mutation({
  args: { id: v.id("promoCodes"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    await requireOwnerCtx(ctx);
    await ctx.db.patch("promoCodes", id, { active });
    return null;
  },
});

/** What the Billing page shows: paid until when, the prices this person gets, and whether payments are on. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const people = await foundingPeople(ctx);
    const founding = people.has(userId) || people.size < PLANS.foundingSeats;
    const history = await ctx.db.query("payments").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(20);
    return {
      on: !!keys(),
      paidUntil: row?.paidUntil ?? null,
      partner: row?.partner ?? null,
      founding,
      // Real seats left at the founding price, so the card can say "41 of 50 left" instead of a vague "next 50".
      foundingLeft: Math.max(0, PLANS.foundingSeats - people.size),
      prices: { week: { ...priceOf("week", founding), was: wasOf("week", founding) }, month: { ...priceOf("month", founding), was: wasOf("month", founding) }, pass: { ...priceOf("pass", founding), was: wasOf("pass", founding) } },
      paid: history.filter((p) => p.status === "paid").map((p) => ({ plan: p.plan, amount: p.amount / 100, paidAt: p.paidAt ?? 0, until: p.until ?? 0, paymentId: p.paymentId ?? "" })),
    };
  },
});

export const orderFacts = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    return { founding: await foundingFor(ctx, userId), email: user?.email ?? "", name: row?.name ?? "" };
  },
});

export const recordOrder = internalMutation({
  args: { userId: v.id("users"), orderId: v.string(), plan: planV, amount: v.number(), founding: v.boolean(), promo: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("payments", { ...args, status: "created" });
    return null;
  },
});

/** Starts a payment: a Razorpay order for the plan at this person's price. The page opens the checkout with it. */
export const createOrder = action({
  args: { plan: planV, promo: v.optional(v.string()) },
  handler: async (
    ctx,
    { plan, promo },
  ): Promise<{ free: true; until: number } | { free: false; keyId: string; orderId: string; amount: number; label: string; email: string; name: string }> => {
    const userId = await requireUserId(ctx);
    if (!OFFERED.includes(plan)) throw new ConvexError("That plan isn't offered any more. The Job Hunt Pass covers everything.");
    let code: { code: string; percentOff: number } | undefined;
    if (promo?.trim()) {
      const found: { error: string } | { code: string; percentOff: number } = await ctx.runQuery(internal.payments.promoFacts, { userId, code: promo, plan });
      if ("error" in found) throw new ConvexError(found.error);
      code = found;
    }
    if (code?.percentOff === 100) {
      const until: number | null = await ctx.runMutation(internal.payments.redeemFree, { userId, plan, code: code.code });
      if (until === null) throw new ConvexError("That code didn't go through. Write to vandana@jobpipe.in.");
      return { free: true, until };
    }
    const k = keys();
    if (!k) throw new ConvexError("Payments aren't switched on yet.");
    const facts: { founding: boolean; email: string; name: string } = await ctx.runQuery(internal.payments.orderFacts, { userId });
    // The Week Pass has one price and doesn't take one of the founding seats; nor does a promo price.
    const founding = plan !== "week" && facts.founding && !code;
    const price = priceOf(plan, facts.founding && plan !== "week");
    const amount = (code ? afterPromo(price.rupees, code.percentOff) : price.rupees) * 100;
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${k.id}:${k.secret}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency: "INR", receipt: `jp_${Date.now()}`, notes: { userId, plan } }),
    });
    if (!res.ok) {
      console.error("Razorpay order failed", res.status, await res.text());
      throw new ConvexError("The payment couldn't start. Try again in a minute.");
    }
    const order = (await res.json()) as { id: string };
    await ctx.runMutation(internal.payments.recordOrder, { userId, orderId: order.id, plan, amount, founding, promo: code?.code });
    return { free: false, keyId: k.id, orderId: order.id, amount, label: price.label, email: facts.email, name: facts.name };
  },
});

/**
 * Marks an order paid and extends the person's paid time. Safe to call twice (checkout reply and webhook both do):
 * only the first call counts. Returns the new paid-until time, or null for an order we don't know.
 */
export const markPaid = internalMutation({
  args: { orderId: v.string(), paymentId: v.string(), amount: v.optional(v.number()) },
  handler: async (ctx, { orderId, paymentId, amount }) => await settlePaid(ctx, orderId, paymentId, amount),
});

async function settlePaid(ctx: MutationCtx, orderId: string, paymentId: string, amount?: number) {
    const payment = await ctx.db.query("payments").withIndex("by_orderId", (q) => q.eq("orderId", orderId)).unique();
    if (!payment) return null;
    if (payment.status === "paid") return payment.until ?? null;
    // A webhook says how much was really taken; anything short of the order isn't a full payment.
    if (amount !== undefined && amount < payment.amount) {
      console.error("Payment smaller than the order", orderId, amount, payment.amount);
      return null;
    }
    const now = Date.now();
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", payment.userId)).unique();
    // Paying early adds to the time already paid for, so nobody loses days.
    const until = Math.max(now, row?.paidUntil ?? 0) + priceOf(payment.plan as PlanKey, payment.founding).days * DAY;
    if (row) await ctx.db.patch("access", row._id, { paidUntil: until });
    else {
      // Paid before joining the list: make their row now so the money still turns the plan on.
      const user = await ctx.db.get("users", payment.userId);
      await ctx.db.insert("access", { userId: payment.userId, email: user?.email ?? "", approved: true, paidUntil: until });
    }
    await ctx.db.patch("payments", payment._id, { status: "paid", paymentId, paidAt: now, until });
    await countPromoUse(ctx, payment.promo);
    return until;
}

/** The checkout's success reply: checked against the key secret, then marked paid. */
export const confirm = action({
  args: { orderId: v.string(), paymentId: v.string(), signature: v.string() },
  handler: async (ctx, { orderId, paymentId, signature }): Promise<{ until: number }> => {
    await requireUserId(ctx);
    const k = keys();
    if (!k) throw new ConvexError("Payments aren't switched on yet.");
    if (!(await paymentGenuine(k.secret, orderId, paymentId, signature))) throw new ConvexError("We couldn't confirm this payment. If money left your account, write to vandana@jobpipe.in.");
    const until: number | null = await ctx.runMutation(internal.payments.markPaid, { orderId, paymentId });
    if (until === null) throw new ConvexError("We couldn't find this order. If money left your account, write to vandana@jobpipe.in.");
    return { until };
  },
});
