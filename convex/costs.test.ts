import { expect, test } from "vitest";
import { costsSection, sumAnthropic } from "./lib/costs";

test("Anthropic cents add up per day and per workspace", () => {
  const buckets = [
    { starting_at: "2026-11-12T00:00:00Z", results: [{ amount: "150.5", workspace_id: "w1" }, { amount: "1000", workspace_id: "other" }] },
    { starting_at: "2026-11-13T00:00:00Z", results: [{ amount: "250", workspace_id: "w1" }] },
  ];
  expect(sumAnthropic(buckets, "2026-11-13T00:00:00.000Z", "w1")).toEqual({ yesterday: 2.5, month: 4.005 });
  expect(sumAnthropic(buckets, "2026-11-13T00:00:00.000Z").month).toBeCloseTo(14.005);
});

test("COSTS block totals what it could read and says what it couldn't", () => {
  const text = costsSection({ ai: null, apify: { yesterday: 0.6, month: 8 }, inrPerUsd: 88 });
  expect(text).toContain("add ANTHROPIC_ADMIN_KEY");
  expect(text).toContain("$0.60 yesterday (₹53), $8.00 this month (₹704)");
  expect(costsSection({ ai: { error: "answered 401" }, apify: null, inrPerUsd: 88 })).toContain("couldn't read (answered 401)");
});
