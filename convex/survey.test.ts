/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { nextSurvey } from "./lib/survey";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 1, 5);

test("asks nothing on day one", () => {
  expect(nextSurvey(START, START + 1.5 * DAY, [])).toBeNull();
});

test("day 2 asks about the jobs, once", () => {
  expect(nextSurvey(START, START + 2.2 * DAY, [])).toEqual({ kind: "found_jobs", round: 0 });
  const past = [{ kind: "found_jobs", round: 0, at: START + 2.2 * DAY }];
  expect(nextSurvey(START, START + 4 * DAY, past)).toBeNull();
});

test("day 6 asks to recommend, but waits 3 days after the last question", () => {
  const past = [{ kind: "found_jobs", round: 0, at: START + 4 * DAY }];
  expect(nextSurvey(START, START + 6 * DAY, past)).toBeNull();
  expect(nextSurvey(START, START + 7.1 * DAY, past)).toEqual({ kind: "recommend", round: 0 });
});

test("someone first back on day 8 skips the day 2 question and gets the day 6 one", () => {
  expect(nextSurvey(START, START + 8 * DAY, [])).toEqual({ kind: "recommend", round: 0 });
});

test("from day 30, asks about interviews once every 30 days", () => {
  expect(nextSurvey(START, START + 31 * DAY, [])).toEqual({ kind: "interviews", round: 1 });
  const past = [{ kind: "interviews", round: 1, at: START + 31 * DAY }];
  expect(nextSurvey(START, START + 50 * DAY, past)).toBeNull();
  expect(nextSurvey(START, START + 61 * DAY, past)).toEqual({ kind: "interviews", round: 2 });
});

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

async function member(t: ReturnType<typeof setup>, withJob: boolean) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@b.com" });
    await ctx.db.insert("access", { userId, email: "a@b.com", approved: true, decidedAt: START });
    return userId;
  });
  if (withJob) {
    await t.run(async (ctx) => {
      await ctx.db.insert("jobs", {
        userId,
        externalId: "ext-1",
        source: "pasted",
        url: "https://example.com/job",
        title: "Account Executive",
        company: "Acme",
        location: "Bengaluru",
        status: "new",
        outreach: [],
        updatedAt: START,
      });
    });
  }
  return t.withIdentity({ subject: `${userId}|session` });
}

test("only people who have found a job get asked", async () => {
  const t = setup();
  const quiet = await member(t, false);
  expect(await quiet.query(api.surveys.next, { now: START + 3 * DAY })).toBeNull();
});

test("an answer is saved once, and the question then goes away", async () => {
  const t = setup();
  const me = await member(t, true);
  const now = START + 3 * DAY;
  expect(await me.query(api.surveys.next, { now })).toEqual({ kind: "found_jobs", round: 0 });
  await me.mutation(api.surveys.answer, { kind: "found_jobs", round: 0, skipped: false, choice: "One or two", note: " more Bengaluru roles " });
  await me.mutation(api.surveys.answer, { kind: "found_jobs", round: 0, skipped: false, choice: "Not yet" });
  const rows = await t.run((ctx) => ctx.db.query("surveyAnswers").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ choice: "One or two", note: "more Bengaluru roles", skipped: false });
  expect(await me.query(api.surveys.next, { now })).toBeNull();
});

test("rejects made-up answers and out-of-range scores", async () => {
  const t = setup();
  const me = await member(t, true);
  await expect(me.mutation(api.surveys.answer, { kind: "found_jobs", round: 0, skipped: false, choice: "Hacked" })).rejects.toThrow("Pick one");
  await expect(me.mutation(api.surveys.answer, { kind: "recommend", round: 0, skipped: false, score: 11 })).rejects.toThrow("0 to 10");
});
