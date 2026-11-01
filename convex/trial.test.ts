/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { trialEmail } from "./lib/email";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 5);

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

async function member(t: ReturnType<typeof setup>, email: string, extra: { decidedAt?: number; paidUntil?: number; trialNoteAt?: number; approved?: boolean }) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email });
    await ctx.db.insert("access", { userId, email, approved: extra.approved ?? true, ...extra });
  });
}

test("check-in goes two days before the free week ends, once, and skips payers and old trials", async () => {
  const t = setup();
  await member(t, "due@example.com", { decidedAt: NOW - 5 * DAY });
  await member(t, "early@example.com", { decidedAt: NOW - 3 * DAY });
  await member(t, "long-gone@example.com", { decidedAt: NOW - 20 * DAY });
  await member(t, "paid@example.com", { decidedAt: NOW - 5 * DAY, paidUntil: NOW + 30 * DAY });
  await member(t, "sent@example.com", { decidedAt: NOW - 5 * DAY, trialNoteAt: NOW - DAY });
  await member(t, "waiting@example.com", { decidedAt: NOW - 5 * DAY, approved: false });
  const due = await t.query(internal.trial.due, { now: NOW });
  expect(due.map((d) => d.email)).toEqual(["due@example.com"]);
  expect(due[0].endsAt).toBe(NOW + 2 * DAY);
  expect(due[0].stats.found).toBe(0);
});

const base = { name: "priya sharma", endsAt: NOW + 2 * DAY, month: 499, pass: 1299 };

test("check-in lists what JobPipe did and gives the price without pressure", () => {
  const m = trialEmail({ ...base, stats: { found: 42, strong: 6, cvs: 3, applied: 2, interviews: 1 } });
  expect(m.subject).toBe("Priya, a quick check-in");
  expect(m.text).toContain("Hi Priya,");
  expect(m.text).toContain("- 42 jobs found, 6 of them a strong fit");
  expect(m.text).toContain("- 3 tailored CVs written");
  expect(m.text).toContain("- 1 job at interview stage");
  expect(m.text).toContain("₹499 a month, or ₹1,299 for 3 months");
  expect(m.text).toContain("Nothing renews on its own");
  expect(m.text).not.toMatch(/hurry|last chance|don't miss|act now/i);
});

test("check-in for someone it found nothing for offers help, not a price", () => {
  const m = trialEmail({ ...base, stats: { found: 0, strong: 0, cvs: 0, applied: 0, interviews: 0 } });
  expect(m.text).toContain("hasn't found you any jobs yet");
  expect(m.text).not.toContain("₹");
});
