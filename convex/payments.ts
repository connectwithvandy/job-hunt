// Paying for JobPipe through Razorpay: Pay creates an order, Razorpay's checkout takes the money, and either the
// checkout's reply or Razorpay's webhook (whichever comes first) marks it paid. Off until the Razorpay keys are set.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { PLANS, priceOf, wasOf, type PlanKey } from "./lib/plans";
import { paymentGenuine } from "./lib/razorpay";

const DAY = 86_400_000;
const planV = v.union(v.literal("month"), v.literal("pass"));

const keys = () => (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? { id: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET } : null);

/** Whether this person pays founding prices: they already did, or fewer than PLANS.foundingSeats people have. */
async function foundingFor(ctx: QueryCtx, userId: Id<"users">) {
  const paid = await ctx.db.query("payments").withIndex("by_status_and_founding", (q) => q.eq("status", "paid").eq("founding", true)).take(500);
  const people = new Set(paid.map((p) => p.userId));
  return people.has(userId) || people.size < PLANS.foundingSeats;
}

/** What the Billing page shows: paid until when, the prices this person gets, and whether payments are on. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const founding = await foundingFor(ctx, userId);
    const history = await ctx.db.query("payments").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(20);
    return {
      on: !!keys(),
      paidUntil: row?.paidUntil ?? null,
      founding,
      prices: { month: { ...priceOf("month", founding), was: wasOf("month", founding) }, pass: { ...priceOf("pass", founding), was: wasOf("pass", founding) } },
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
  args: { userId: v.id("users"), orderId: v.string(), plan: planV, amount: v.number(), founding: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.insert("payments", { ...args, status: "created" });
    return null;
  },
});

/** Starts a payment: a Razorpay order for the plan at this person's price. The page opens the checkout with it. */
export const createOrder = action({
  args: { plan: planV },
  handler: async (ctx, { plan }): Promise<{ keyId: string; orderId: string; amount: number; label: string; email: string; name: string }> => {
    const userId = await requireUserId(ctx);
    const k = keys();
    if (!k) throw new ConvexError("Payments aren't switched on yet.");
    const facts: { founding: boolean; email: string; name: string } = await ctx.runQuery(internal.payments.orderFacts, { userId });
    const price = priceOf(plan, facts.founding);
    const amount = price.rupees * 100;
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
    await ctx.runMutation(internal.payments.recordOrder, { userId, orderId: order.id, plan, amount, founding: facts.founding });
    return { keyId: k.id, orderId: order.id, amount, label: price.label, email: facts.email, name: facts.name };
  },
});

/**
 * Marks an order paid and extends the person's paid time. Safe to call twice (checkout reply and webhook both do):
 * only the first call counts. Returns the new paid-until time, or null for an order we don't know.
 */
export const markPaid = internalMutation({
  args: { orderId: v.string(), paymentId: v.string(), amount: v.optional(v.number()) },
  handler: async (ctx, { orderId, paymentId, amount }) => {
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
    await ctx.db.patch("payments", payment._id, { status: "paid", paymentId, paidAt: now, until });
    return until;
  },
});

/** The checkout's success reply: checked against the key secret, then marked paid. */
export const confirm = action({
  args: { orderId: v.string(), paymentId: v.string(), signature: v.string() },
  handler: async (ctx, { orderId, paymentId, signature }): Promise<{ until: number }> => {
    await requireUserId(ctx);
    const k = keys();
    if (!k) throw new ConvexError("Payments aren't switched on yet.");
    if (!(await paymentGenuine(k.secret, orderId, paymentId, signature))) throw new ConvexError("We couldn't confirm this payment. If money left your account, write to hello@jobpipe.in.");
    const until: number | null = await ctx.runMutation(internal.payments.markPaid, { orderId, paymentId });
    if (until === null) throw new ConvexError("We couldn't find this order. If money left your account, write to hello@jobpipe.in.");
    return { until };
  },
});
