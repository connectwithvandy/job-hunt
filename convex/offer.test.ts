/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { offerEmail } from "./lib/email";

const modules = import.meta.glob("./**/*.ts");

test("the offer email gives their own numbers, the founding price and the one-click answers", () => {
  const m = offerEmail({ name: "asha", jobs: 682, scored: 40, strong: 6, token: "abc123" });
  expect(m.subject).toBe("Asha, 3 months of JobPipe for ₹999");
  expect(m.text).toContain("found you 682 sales roles and scored 40 against your CV. 6 of them were a strong fit.");
  expect(m.text).toContain("₹999 for 3 months (normally ₹1,499)");
  expect(m.text).toContain("/offer?k=abc123&a=too_pricey");
  // No numbers line for someone with no jobs yet.
  expect(offerEmail({ jobs: 0, scored: 0, strong: 0, token: "x" }).text).not.toContain("found you");
});

test("offer goes once to people not paying; an answer is saved only for a known link and a known choice", async () => {
  const t = convexTest(schema, modules);
  const [free, paid] = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", {});
    const b = await ctx.db.insert("users", {});
    await ctx.db.insert("access", { userId: a, email: "free@example.com", name: "Free", approved: true });
    await ctx.db.insert("access", { userId: b, email: "paid@example.com", name: "Paid", approved: true, paidUntil: Date.now() + 86_400_000 });
    return [a, b];
  });
  const first = await t.query(internal.offerData.recipients, {});
  expect(first.map((r) => r.email)).toEqual(["free@example.com"]);
  expect(first.some((r) => r.userId === paid)).toBe(false);
  await t.mutation(internal.offerData.record, { userId: free, email: "free@example.com", token: "tok1" });
  expect(await t.query(internal.offerData.recipients, {})).toEqual([]);
  expect(await t.mutation(internal.offerData.answer, { token: "nope", answer: "too_pricey" })).toBe(false);
  expect(await t.mutation(internal.offerData.answer, { token: "tok1", answer: "made_up" })).toBe(false);
  expect(await t.mutation(internal.offerData.answer, { token: "tok1", answer: "too_pricey", note: " student " })).toBe(true);
  const res = await t.query(internal.offerData.results, {});
  expect(res.answered).toBe(1);
  expect(res.notes[0]).toContain("student");
});
