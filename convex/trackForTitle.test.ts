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
