/// <reference types="vite/client" />
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { paymentGenuine, webhookGenuine } from "./lib/razorpay";
import { PLANS, priceOf } from "./lib/plans";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

async function member(t: ReturnType<typeof setup>, email: string, paidUntil?: number) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email });
    await ctx.db.insert("access", { userId, email, approved: true, paidUntil });
    return userId;
  });
}

test("signatures match Razorpay's: HMAC-SHA256 of order|payment, and of the raw webhook body", async () => {
  const secret = "test_secret";
  const good = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
  expect(await paymentGenuine(secret, "order_1", "pay_1", good)).toBe(true);
  expect(await paymentGenuine(secret, "order_1", "pay_2", good)).toBe(false);
  const body = '{"event":"payment.captured"}';
  expect(await webhookGenuine(secret, body, createHmac("sha256", secret).update(body).digest("hex"))).toBe(true);
  expect(await webhookGenuine(secret, body, "nope")).toBe(false);
});

test("founding and full prices", () => {
  expect(priceOf("month", true)).toMatchObject({ rupees: 499, days: 30 });
  expect(priceOf("month", false)).toMatchObject({ rupees: 999, days: 30 });
  expect(priceOf("pass", true)).toMatchObject({ rupees: 1299, days: 90 });
  expect(priceOf("pass", false)).toMatchObject({ rupees: 2499, days: 90 });
});

test("a payment adds its days once, on top of time already paid; a short payment adds nothing", async () => {
  const t = setup();
  const later = Date.now() + 10 * DAY;
  const userId = await member(t, "a@example.com", later);
  await t.mutation(internal.payments.recordOrder, { userId, orderId: "order_a", plan: "month", amount: 49_900, founding: true });
  const until = await t.mutation(internal.payments.markPaid, { orderId: "order_a", paymentId: "pay_a" });
  expect(until).toBe(later + 30 * DAY);
  // The webhook arriving after the checkout reply changes nothing.
  expect(await t.mutation(internal.payments.markPaid, { orderId: "order_a", paymentId: "pay_a", amount: 49_900 })).toBe(until);
  const row = await t.run(async (ctx) => await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique());
  expect(row?.paidUntil).toBe(until);

  await t.mutation(internal.payments.recordOrder, { userId, orderId: "order_b", plan: "pass", amount: 129_900, founding: true });
  expect(await t.mutation(internal.payments.markPaid, { orderId: "order_b", paymentId: "pay_b", amount: 100 })).toBeNull();
  expect(await t.mutation(internal.payments.markPaid, { orderId: "unknown", paymentId: "pay_x" })).toBeNull();
});

test("founding prices stop after the founding seats fill, but stay for those who already have them", async () => {
  const t = setup();
  const ids = [];
  for (let i = 0; i < PLANS.foundingSeats; i++) {
    const userId = await member(t, `p${i}@example.com`);
    await t.mutation(internal.payments.recordOrder, { userId, orderId: `o${i}`, plan: "month", amount: 49_900, founding: true });
    await t.mutation(internal.payments.markPaid, { orderId: `o${i}`, paymentId: `pay${i}` });
    ids.push(userId);
  }
  const late = await member(t, "late@example.com");
  expect((await t.query(internal.payments.orderFacts, { userId: late })).founding).toBe(false);
  expect((await t.query(internal.payments.orderFacts, { userId: ids[0] })).founding).toBe(true);
});
