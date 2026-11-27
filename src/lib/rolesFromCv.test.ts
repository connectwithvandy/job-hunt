import { expect, test } from "vitest";
import { rolesFromCv } from "./rolesFromCv";
import { SALES_ROLES } from "../../convex/lib/salesRoles";

test("an SDR manager CV points to leadership, not SDR", () => {
  expect(rolesFromCv(["SDR Manager"], SALES_ROLES)[0]).not.toBe("sdr");
});

test("an AE CV points to Account Executive", () => {
  expect(rolesFromCv(["Senior Account Executive"], SALES_ROLES)).toEqual(["account-executive"]);
});

test("titles with no match give nothing", () => {
  expect(rolesFromCv(["Pastry Chef"], SALES_ROLES)).toEqual([]);
});

test("'Manager of Sales Development' is a leader, not an SDR", () => {
  const got = rolesFromCv(["Manager of Sales Development"], SALES_ROLES);
  expect(got.length).toBe(1);
  expect(got[0]).not.toBe("sdr");
});
