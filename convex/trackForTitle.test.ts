import { expect, test } from "vitest";
import { SALES_ROLES, trackForTitle } from "./lib/salesRoles";

const tracks = SALES_ROLES;

test("each job lands in the group its title fits best", () => {
  expect(trackForTitle(tracks, "Sales Development Manager")).toBe("sdr-leadership");
  expect(trackForTitle(tracks, "Inside Sales Manager")).toBe("sdr-leadership");
  expect(trackForTitle(tracks, "SDR")).toBe("sdr");
  expect(trackForTitle(tracks, "Head of Sales")).toBe("sales-leadership");
  expect(trackForTitle(tracks, "Regional Sales Manager")).toBe("sales-leadership");
  expect(trackForTitle(tracks, "Key Account Manager")).toBe("account-management");
  expect(trackForTitle(tracks, "Senior Account Manager")).toBe("account-management");
  expect(trackForTitle(tracks, "Enterprise Account Executive")).toBe("account-executive");
});

test("AE team leads fit Sales Leadership, even for someone who only searches leadership roles", () => {
  const lead = tracks.filter((t) => ["sdr-leadership", "sales-leadership"].includes(t.key));
  expect(trackForTitle(lead, "Account Executive Team Lead")).toBe("sales-leadership");
  expect(trackForTitle(lead, "AE Manager")).toBe("sales-leadership");
});

test("Salesforce engineers aren't sales jobs", () => {
  expect(trackForTitle(tracks, "Sr Engineer Salesforce")).toBeUndefined();
  expect(trackForTitle(tracks, "Salesforce Administrator Manager")).toBeUndefined();
  expect(trackForTitle(tracks, "Sales Managers - North")).toBe("sales-leadership");
});

test("delivery roles that mention post-sales aren't sales jobs", () => {
  expect(trackForTitle(tracks, "Delivery Manager - Controls Post-sales - Hardware Design")).toBeUndefined();
});

test("any Account Executive search finds every title holding account executive", async () => {
  const { titleMatches } = await import("./lib/salesRoles");
  const stripe = "Account Executive, Commercial & SMB (India)";
  for (const s of ["Account Executive", "Enterprise Account Executive", "Senior AE", "Mid-Market Account Executive"]) expect(titleMatches(s, stripe)).toBe(true);
  expect(titleMatches("Enterprise Account Executive", "Technical Account Executive")).toBe(true);
  expect(titleMatches("Enterprise Account Executive", "Account Executive Team Lead")).toBe(true);
  // "AE" in a title counts as account executive.
  expect(titleMatches("Enterprise Account Executive", "AE, Commercial (India)")).toBe(true);
  expect(titleMatches("Senior AE", "Founding AE")).toBe(true);
  expect(titleMatches("Account Executive", "Sr. AE")).toBe(true);
  // Bookkeeping jobs still stay out.
  expect(titleMatches("Account Executive", "Accounts Executive")).toBe(false);
  expect(titleMatches("Account Executive", "Accounting Executive")).toBe(false);
  // Other searches unchanged.
  expect(titleMatches("Account Manager", stripe)).toBe(false);
});
