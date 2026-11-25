import { expect, test } from "vitest";
import { postCode } from "./postedJobs";

test("a posted job's code is short, link-safe and the same every time", () => {
  const code = postCode("https://ats.rippling.com/rippling/jobs/123");
  expect(code).toMatch(/^[0-9a-z]{1,7}$/);
  expect(postCode("https://ats.rippling.com/rippling/jobs/123")).toBe(code);
  expect(postCode("https://ats.rippling.com/rippling/jobs/124")).not.toBe(code);
});
