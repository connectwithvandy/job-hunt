import { expect, test } from "vitest";
import { composeLine, postHook, stated } from "./postLine";

test("experience and pay are kept only when the posting states them", () => {
  const text = "We want 3-6 years of SaaS sales. CTC: ₹18,00,000 - ₹24,00,000 per year.";
  expect(stated("3-6 yrs", text)).toBe("3-6 yrs");
  expect(stated("5+ yrs", text)).toBe("");
  expect(stated("₹18-24 L", text)).toBe("");
  expect(stated("₹18,00,000-24,00,000", text)).toBe("₹18,00,000-24,00,000");
  expect(stated("", text)).toBe("");
  expect(stated("competitive", text)).toBe("");
});

test("a job line joins whatever is known", () => {
  expect(composeLine("1-2 yrs", "₹8-10 L", "Books meetings.")).toBe("1-2 yrs · ₹8-10 L · Books meetings.");
  expect(composeLine("", "", "Books meetings.")).toBe("Books meetings.");
});

test("the first line names up to three companies", () => {
  expect(postHook(["Samsara", "Samsara", "Freshworks", "Rippling", "Chargebee"], 5)).toBe("Samsara, Freshworks and Rippling are hiring sales in India this week 👇");
  expect(postHook(["Samsara", "Freshworks"], 3)).toBe("Samsara and Freshworks are hiring sales in India this week 👇");
  expect(postHook(["Samsara", "Samsara", "Samsara"], 3)).toBe("Samsara is hiring 3 sales roles in India this week 👇");
});
