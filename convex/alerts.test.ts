/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { fingerprintOf } from "./lib/careers";
import { alertsEmail, freshEmail, weeklyEmail } from "./lib/email";

const modules = import.meta.glob("./**/*.ts");

test("new-roles email: today's new jobs with a title in their groups, unless the AI said skip, AI-scored first, under the person's own groups; skips people who said stop", async () => {
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
    await ctx.db.insert("jobs", { userId: ids.a, ...job("Sales Development Manager", { quickFit: 100 }) });
    await ctx.db.insert("jobs", { userId: ids.a, ...job("Dismissed SDR", { status: "dismissed" }) });
    // Scored as one to skip, and a title outside their groups: neither makes the email.
    await ctx.db.insert("jobs", { userId: ids.a, ...job("BDR", { scores: [{ trackKey: "sdr", score: 40, reason: "", gaps: [] }] }) });
    await ctx.db.insert("jobs", { userId: ids.a, ...job("Office Manager", { scores: [{ trackKey: "sdr", score: 90, reason: "", gaps: [] }] }) });
    await ctx.db.insert("jobs", { userId: ids.b, ...job("SDR") });
  });
  const due = await t.action(internal.alerts.due, { now: NOW });
  vi.useRealTimers();
  expect(due.map((d) => d.email)).toEqual(["a@example.com"]);
  // The AI-scored role first, then the one not scored yet, which shows no fit number; each under its own group.
  expect(due[0].groups).toEqual([
    { track: "SDR / BDR", jobs: [expect.objectContaining({ title: "SDR", fit: 60 })] },
    { track: "Sales Development Leadership", jobs: [expect.objectContaining({ title: "Sales Development Manager" })] },
  ]);
  expect(due[0].groups[1].jobs[0].fit).toBeUndefined();
  expect(due[0].searching).toBeTruthy();
  expect(due[0].free).toBe(false);
  const mail = alertsEmail({ ...due[0], unsubscribeUrl: "https://jobpipe.in/unsubscribe?k=abc" });
  expect(mail.subject).toBe("Asha, SDR / BDR: 1 new role + 1 more");
  expect(mail.text).toContain("/jobs/");
  expect(mail.text).toContain("Unsubscribe in one click: https://jobpipe.in/unsubscribe?k=abc");
  expect(mail.text).not.toContain("Week Pass");
  expect(alertsEmail({ ...due[0], free: true }).text).toContain("Week Pass (₹349)");
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
  expect(await t.action(internal.alerts.due, { now: Date.now() + 60_000 })).toEqual([]);
});

test("weekly email: only people set up with new jobs, and it asks for fresh connections when old", async () => {
  const NOW = Date.now();
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async (ctx) => {
    const add = async (email: string, onboarded: boolean, jobs: number) => {
      const userId = await ctx.db.insert("users", { email });
      const accessId = await ctx.db.insert("access", { userId, email, approved: true, name: "asha" });
      await ctx.db.insert("profiles", { userId, location: "India", onboarded, contactsCount: 5, contactsLoadedAt: NOW - 40 * 86_400_000 });
      for (let i = 0; i < jobs; i++) await ctx.db.insert("jobs", { userId, externalId: `${email}${i}`, source: "careers", url: "https://x", title: "SDR", company: "Acme", location: "Pune", status: "new", outreach: [], updatedAt: 0 });
      return accessId;
    };
    return { active: await add("a@example.com", true, 2), notSetUp: await add("b@example.com", false, 2), quiet: await add("c@example.com", true, 0) };
  });
  const week = await t.query(internal.alerts.weekFor, { accessId: ids.active, now: NOW + 1000 });
  expect(week).toMatchObject({ found: 2, refreshConnections: true });
  expect(await t.query(internal.alerts.weekFor, { accessId: ids.notSetUp, now: NOW + 1000 })).toBe(null);
  expect(await t.query(internal.alerts.weekFor, { accessId: ids.quiet, now: NOW + 1000 })).toBe(null);
  const mail = weeklyEmail(week!);
  expect(mail.subject).toBe("Asha, your week on JobPipe");
  expect(mail.text).toContain("refresh your LinkedIn connections");
});

describe("fresh job alerts", () => {
  const setup = async (extra = {}) => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "a@example.com" });
      await ctx.db.insert("access", { userId: id, email: "a@example.com", name: "Asha", approved: true, ...extra });
      return id;
    });
    return { t, userId, claim: (day: string) => t.mutation(internal.alerts.claimFresh, { userId, day }) };
  };

  test("one person gets at most 3 a day, and the count starts over the next day", async () => {
    const { claim } = await setup();
    for (let i = 0; i < 3; i++) expect((await claim("2026-11-08"))?.email).toBe("a@example.com");
    expect(await claim("2026-11-08")).toBeNull();
    expect((await claim("2026-11-09"))?.email).toBe("a@example.com");
  });

  test("someone who asked to stop emails gets none", async () => {
    const { claim } = await setup({ alertsOff: true });
    expect(await claim("2026-11-08")).toBeNull();
  });

  test("the alert names the job, its fit and a link", () => {
    const m = freshEmail({ name: "asha test", jobs: [{ id: "j1", title: "Account Executive", company: "Acme", where: "Bengaluru", fit: 82 }, { id: "j2", title: "AE", company: "Beta", where: "Remote", fit: 76 }] });
    expect(m.subject).toBe("New: Account Executive at Acme (82% fit) and 1 more");
    expect(m.text).toContain("Hi Asha,");
    expect(m.text).toContain("/jobs/j1");
  });
});

test("a board's fingerprint ignores order and changes when a job is added", async () => {
  const a = await fingerprintOf(["1", "2", "3"]);
  expect(await fingerprintOf(["3", "1", "2"])).toBe(a);
  expect(await fingerprintOf(["1", "2", "3", "4"])).not.toBe(a);
});
