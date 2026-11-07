import { expect, test } from "vitest";
import { healthSection, type HealthFacts } from "./lib/health";

const NOW = 1_800_000_000_000;
const base: HealthFacts = { people: 2, runs: [], letIn: 3, paying: 1, trialOver: 0, lockingSoon: 1, aiUsed: 100, aiLimit: 1000 };
const run = (extra = {}) => ({ at: NOW - 3_600_000, added: 10, scored: 24, strong: 2, ...extra });

test("adds up today's run and groups a source's failures under one name", () => {
  const h = healthSection({ ...base, runs: [run({ failed: ["Google Jobs (this month's free searches are used up)", "Dreamwork"] }), run({ added: 1, strong: 0, scored: 1, failed: ["Google Jobs (this month's free searches are used up)"] })] }, NOW, 24);
  expect(h.alarm).toBe(false);
  expect(h.headline).toBe("2 of 2 ran");
  expect(h.text).toContain("11 added, 25 scored, 2 strong matches");
  expect(h.text).toContain("1 with no strong match, 1 with 0 or 1 new jobs, 1 at the 24 score limit");
  expect(h.text).toContain("Google Jobs (2), Dreamwork (1)");
});

test("warns when the morning run missed people, and yesterday's run doesn't count", () => {
  const h = healthSection({ ...base, runs: [run(), run({ at: NOW - 25 * 3_600_000 })] }, NOW, 24);
  expect(h.alarm).toBe(true);
  expect(h.text).toContain("missed 1 of 2 people");
});

test("warns when no run happened at all", () => {
  const h = healthSection(base, NOW, 24);
  expect(h.alarm).toBe(true);
  expect(h.headline).toBe("0 of 2 ran");
});

test("warns as AI use nears the daily limit", () => {
  const h = healthSection({ ...base, runs: [run(), run()], aiUsed: 800 }, NOW, 24);
  expect(h.alarm).toBe(true);
  expect(h.text).toContain("800 of today's 1000 units");
});
