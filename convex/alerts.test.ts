/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { fingerprintOf, indiaFacet } from "./lib/careers";
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
    // On JobPipe yesterday, so on the daily email.
    await ctx.db.insert("profiles", { userId: a, location: "India", onboarded: true, contactsCount: 0, lastSeenAt: NOW - 86_400_000 } as never);
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
  expect(mail.text).not.toContain("Job Hunt Pass");
  expect(alertsEmail({ ...due[0], free: true }).text).toContain("Job Hunt Pass (from ₹999 for 3 months)");
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

test("weekly email: only people set up with new jobs, and it never asks to refresh LinkedIn connections", async () => {
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
  expect(week).toMatchObject({ found: 2 });
  expect(await t.query(internal.alerts.weekFor, { accessId: ids.notSetUp, now: NOW + 1000 })).toBe(null);
  expect(await t.query(internal.alerts.weekFor, { accessId: ids.quiet, now: NOW + 1000 })).toBe(null);
  const mail = weeklyEmail(week!);
  expect(mail.subject).toBe("Asha, your week on JobPipe");
  expect(mail.text).not.toContain("LinkedIn connections");
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

test("the daily email opens with the best untailored fit, when there is one", () => {
  const groups = [{ track: "SDR / BDR", jobs: [{ title: "SDR", company: "Acme", where: "Bengaluru", id: "j1" }] }];
  const withTailor = alertsEmail({ name: "asha", groups, tailor: { title: "SDR Manager", company: "Rippling", fit: 84, id: "j9" } });
  expect(withTailor.text).toContain("Your best fit so far: SDR Manager at Rippling (fit 84). Tailor your CV for it");
  expect(withTailor.html).toContain("/jobs/j9");
  expect(alertsEmail({ name: "asha", groups }).text).not.toContain("best fit so far");
});

test("quiet people get the new-roles email on Monday and Thursday only; people on JobPipe in the last 3 days, partner members and payers get it daily", async () => {
  const t = convexTest(schema, modules);
  const TUE = Date.UTC(2026, 10, 17, 4); // 9:30 India time, Tuesday
  const MON = Date.UTC(2026, 10, 16, 4);
  const ids = await t.run(async (ctx) => {
    const active = await ctx.db.insert("users", {});
    const quiet = await ctx.db.insert("users", {});
    await ctx.db.insert("access", { userId: active, email: "active@example.com", approved: true });
    await ctx.db.insert("access", { userId: quiet, email: "quiet@example.com", approved: true });
    const partner = await ctx.db.insert("users", {});
    await ctx.db.insert("access", { userId: partner, email: "partner@example.com", approved: true, partner: { name: "SaasPire", url: "https://saaspire.co", from: TUE - 9 * 86_400_000, until: TUE + 80 * 86_400_000 } });
    await ctx.db.insert("profiles", { userId: active, location: "India", onboarded: true, contactsCount: 0, lastSeenAt: TUE - 2 * 86_400_000 } as never);
    await ctx.db.insert("profiles", { userId: quiet, location: "India", onboarded: true, contactsCount: 0, lastSeenAt: TUE - 9 * 86_400_000 } as never);
    return { active, quiet };
  });
  const emails = async (now: number) => {
    const rows = await t.query(internal.alerts.candidates, { now });
    return t.run(async (ctx) => Promise.all(rows.map(async (id) => (await ctx.db.get(id))!.email)));
  };
  // Partner members get it daily even when quiet.
  expect((await emails(TUE)).sort()).toEqual(["active@example.com", "partner@example.com"]);
  expect((await emails(MON)).sort()).toEqual(["active@example.com", "partner@example.com", "quiet@example.com"]);
});

test("each job in the daily email has a one-click Apply link to the company's posting, when there is one", () => {
  const mail = alertsEmail({
    groups: [{ track: "SDR / BDR", jobs: [
      { title: "SDR", company: "Acme", where: "Bengaluru", fit: 80, id: "j1", applyUrl: "https://jobs.acme.com/sdr" },
      { title: "BDR", company: "Beta", where: "Remote", id: "j2" },
    ] }],
  });
  expect(mail.html).toContain('href="https://jobs.acme.com/sdr"');
  expect(mail.text).toContain("Apply: https://jobs.acme.com/sdr");
  expect(mail.html.match(/>Apply</g)?.length).toBe(1);
});

test("Workday India filter uses the filter name the India value sits under", () => {
  // Adobe nests "locationCountry" inside "locationMainGroup"; the outer name answered 400 (21 Nov).
  const nested = [{ facetParameter: "locationMainGroup", values: [
    { facetParameter: "locationCountry", values: [{ descriptor: "India", id: "c1", count: 46 }, { descriptor: "Germany", id: "c2", count: 9 }] },
    { facetParameter: "locations", values: [{ descriptor: "Remote India", id: "l1", count: 1 }] },
  ] }];
  expect(indiaFacet(nested)).toEqual({ param: "locationCountry", ids: ["c1"] });
  // Flat sites keep working.
  expect(indiaFacet([{ facetParameter: "locationCountry", values: [{ descriptor: "India", id: "x", count: 3 }] }])).toEqual({ param: "locationCountry", ids: ["x"] });
  expect(indiaFacet([{ facetParameter: "timeType", values: [{ descriptor: "Full time", id: "t", count: 3 }] }])).toBeNull();
});
