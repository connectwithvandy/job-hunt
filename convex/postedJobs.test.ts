import { expect, test } from "vitest";
import { dayCode, postCode } from "./postedJobs";

test("a posted job's code is short, link-safe and the same every time", () => {
  const code = postCode("https://ats.rippling.com/rippling/jobs/123");
  expect(code).toMatch(/^[0-9a-z]{1,7}$/);
  expect(postCode("https://ats.rippling.com/rippling/jobs/123")).toBe(code);
  expect(postCode("https://ats.rippling.com/rippling/jobs/124")).not.toBe(code);
});

test("the day's code is the date in India, and never looks like a job code", () => {
  // 26 Nov 2026, 20:00 UTC is already 27 Nov in India.
  expect(dayCode(Date.UTC(2026, 10, 26, 20, 0))).toBe("20261127");
  expect(dayCode(Date.UTC(2026, 10, 26, 3, 45))).toBe("20261126");
  expect(dayCode(0)).toMatch(/^\d{8}$/);
});
