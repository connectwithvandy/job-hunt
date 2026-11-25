import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { cityOf, publicRoleCode, publicRoleHref } from "./lib/publicRole";
import { isPublicRole } from "./publicRoles";

test("role codes match the website's old ones, so links already on Google keep working", async () => {
  const id = "workday:salesforce/JR123456";
  expect(await publicRoleCode(id)).toBe(createHash("sha1").update(id).digest("hex").slice(0, 10));
  expect(publicRoleHref("Sales Development Representative", "Rippling", "3f9a1c2b7e")).toBe("/sales-jobs/role/sales-development-representative-at-rippling-3f9a1c2b7e");
});

test("cities and remote are read from the location", () => {
  expect(cityOf("Bangalore, Karnataka, India")).toBe("bengaluru");
  expect(cityOf("Gurugram, Haryana")).toBe("delhi-ncr");
  expect(cityOf("India", "remote")).toBe("remote");
  expect(cityOf("Kolkata")).toBe("");
});

test("only recent sales roles from employers get a page", () => {
  const now = Date.parse("2026-11-25");
  expect(isPublicRole({ company: "Rippling", title: "Sales Development Representative", postedAt: "2026-11-20" }, now)).toBe(true);
  expect(isPublicRole({ company: "Rippling", title: "Sales Development Representative", postedAt: "2026-09-01" }, now)).toBe(false);
  expect(isPublicRole({ company: "ABC Staffing", title: "Account Executive" }, now)).toBe(false);
  expect(isPublicRole({ company: "Rippling", title: "Software Engineer" }, now)).toBe(false);
  expect(isPublicRole({ company: "Rippling", title: "Sales Intern" }, now)).toBe(false);
});
