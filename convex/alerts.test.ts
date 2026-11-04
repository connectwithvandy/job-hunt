/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { alertsEmail } from "./lib/email";

const modules = import.meta.glob("./**/*.ts");

test("new-roles email: today's relevant new jobs (fit 60+, title in their groups), best fit first, under the person's own groups; skips people who said stop", async () => {
  vi.useFakeTimers();
  const NOW = Date.UTC(2026, 10, 10, 4);
  vi.setSystemTime(NOW - 2 * 86_400_000);
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const job = (title: string, extra: Record<string, unknown> = {}) => ({
    externalId: title, source: "careers" as const, url: "https://x", title, company: "Acme", location: "Bengaluru", status: "new" as const, outreach: [], updatedAt: 0, ...extra,
  });
  const ids = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "a@example.com" });
    const b = await ctx.db.insert("users", { email: "b@example.com" });
    await ctx.db.insert("access", { userId: a, email: "a@example.com", approved: true, name: "asha" });
    await ctx.db.insert("access", { userId: b, email: "b@example.com", approved: true, alertsOff: true });
    for (const u of [a, b]) {
      await ctx.db.insert("tracks", { userId: u, key: "sdr", name: "SDR / BDR", color: "#000", status: "active", titles: ["SDR"], pitch: "" });
      await ctx.db.insert("tracks", { userId: u, key: "lead", name: "Sales Development Leadership", color: "#000", status: "active", titles: ["Sales Development Manager"], pitch: "" });
    }
    // Two days old: not new any more.
    await ctx.db.insert("jobs", { userId: a, ...job("Old SDR") });
    return { a, b };
  });
  vi.setSystemTime(NOW - 3_600_000);
  await t.run(async (ctx) => {
    await ctx.db.insert("jobs", { userId: ids.a, ...job("SDR", { scores: [{ trackKey: "sdr", score: 60, reason: "", gaps: [] }] }) });
    await ctx.db.insert("jobs", { userId: ids.a, ...job("Sales Development Manager", { quickFit: 150 }) });
    await ctx.db.insert("jobs", { userId: ids.a, ...job("Dismissed SDR", { status: "dismissed" }) });
    // Weak fit, and a title outside their groups: neither makes the email.
    await ctx.db.insert("jobs", { userId: ids.a, ...job("BDR", { scores: [{ trackKey: "sdr", score: 40, reason: "", gaps: [] }] }) });
    await ctx.db.insert("jobs", { userId: ids.a, ...job("Office Manager", { scores: [{ trackKey: "sdr", score: 90, reason: "", gaps: [] }] }) });
    await ctx.db.insert("jobs", { userId: ids.b, ...job("SDR") });
  });
  const due = await t.query(internal.alerts.due, { now: NOW });
  vi.useRealTimers();
  expect(due.map((d) => d.email)).toEqual(["a@example.com"]);
  // Fit 75 (first guess) before fit 60 (AI score); each under its own group.
  expect(due[0].groups).toEqual([
    { track: "Sales Development Leadership", jobs: [expect.objectContaining({ title: "Sales Development Manager", fit: 75 })] },
    { track: "SDR / BDR", jobs: [expect.objectContaining({ title: "SDR", fit: 60 })] },
  ]);
  const mail = alertsEmail(due[0]);
  expect(mail.subject).toBe("2 new roles for you today, Asha");
  expect(mail.text).toContain("/jobs/");
});

test("no email when nothing new is relevant", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "c@example.com" });
    await ctx.db.insert("access", { userId: a, email: "c@example.com", approved: true });
    await ctx.db.insert("tracks", { userId: a, key: "sdr", name: "SDR / BDR", color: "#000", status: "active", titles: ["SDR"], pitch: "" });
    await ctx.db.insert("jobs", { userId: a, externalId: "1", source: "careers", url: "https://x", title: "SDR", company: "Acme", location: "Pune", status: "new", outreach: [], updatedAt: 0, scores: [{ trackKey: "sdr", score: 45, reason: "", gaps: [] }] });
  });
  expect(await t.query(internal.alerts.due, { now: Date.now() + 60_000 })).toEqual([]);
});
