import { expect, test } from "vitest";
import { regionsOf, titleElsewhere } from "./regions";

test("a title naming another Indian territory leaves Bengaluru or remote; a market abroad doesn't", () => {
  expect(regionsOf({ title: "Senior Territory Account Executive (Gujarat)", location: "India (Remote)" })).not.toContain("blr");
  expect(regionsOf({ title: "Account Executive - US", location: "Bengaluru" })).toContain("blr");
  expect(regionsOf({ title: "Join us as an Account Executive", location: "Bengaluru" })).toContain("blr");
  expect(titleElsewhere("Sales Development Representative (Gujarat)", "Bengaluru")).toBe(true);
  expect(titleElsewhere("SDR - Mumbai", "Mumbai")).toBe(false);
  expect(titleElsewhere("Account Executive - US", "Bengaluru")).toBe(false);
});
