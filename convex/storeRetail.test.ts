import { expect, test } from "vitest";
import { sameRoleKey, storeRetailJob } from "./lib/company";

test("shop-floor retail jobs are out; B2B sales jobs stay (owner, 27 Nov: no BIBA)", () => {
  expect(storeRetailJob({ company: "BIBA", title: "Sales Executive 1344", location: "VEGA CITY MALL-LS-BLR, Bangalore" })).toBe(true);
  expect(storeRetailJob({ company: "Some Brand", title: "Sales Executive", location: "Forum Mall, Bengaluru" })).toBe(true);
  expect(storeRetailJob({ company: "Acme", title: "Retail Sales Associate", location: "Bengaluru" })).toBe(true);
  expect(storeRetailJob({ company: "Coderabbit", title: "Account Executive - Enterprise - India (Bengaluru)", location: "Bengaluru" })).toBe(false);
  expect(storeRetailJob({ company: "Salesforce", title: "Business Development Representative", location: "Bengaluru, India" })).toBe(false);
  expect(storeRetailJob({ company: "Shopify", title: "Account Executive, Retail", location: "Remote" })).toBe(false);
});

test("a store code at the end of a title is one role", () => {
  expect(sameRoleKey("BIBA", "Sales Executive Fmb 02")).toBe(sameRoleKey("BIBA", "Sales Executive 1344"));
});
