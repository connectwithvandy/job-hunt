import { expect, test } from "vitest";
import { KEEP_MAX, dreamworkTitles, mergeListings } from "./lib/dreamworkPlan";
import { SALES_ROLES } from "./lib/salesRoles";

const ae = SALES_ROLES.find((r) => r.key === "account-executive")!.titles;
const sdr = SALES_ROLES.find((r) => r.key === "sdr")!.titles;

test("a city searches only the broad titles; India, Remote and Anywhere search them all", () => {
  expect(dreamworkTitles(ae, "Bengaluru")).toEqual(["Account Executive"]);
  expect(dreamworkTitles(ae, "India")).toEqual(ae);
  expect(dreamworkTitles(ae, "Remote")).toEqual(ae);
  expect(dreamworkTitles(ae, "anywhere")).toEqual(ae);
});

test("short forms aren't searched, so the full names find the SDR roles in a city", () => {
  const t = dreamworkTitles(sdr, "Bengaluru");
  expect(t).toContain("Sales Development Representative");
  expect(t).not.toContain("SDR");
  expect(t).not.toContain("BDR");
});

test("top-up: new listings first, no repeats, and nothing posted over 30 days ago", () => {
  const now = Date.parse("2026-11-24T10:00:00Z");
  type L = { id: string; postedAt?: string | null; firstSeenAt?: string };
  const saved: L[] = [
    { id: "a", postedAt: "2026-11-20T00:00:00Z" },
    { id: "b", postedAt: "2026-10-01T00:00:00Z" },
    { id: "c", postedAt: null, firstSeenAt: "2026-11-22T00:00:00Z" },
  ];
  const fresh: L[] = [
    { id: "d", postedAt: "2026-11-24T00:00:00Z" },
    { id: "a", postedAt: "2026-11-20T00:00:00Z" },
  ];
  expect(mergeListings(fresh, saved, now).map((l) => l.id)).toEqual(["d", "a", "c"]);
});

test("the saved list stays capped", () => {
  const now = Date.now();
  const many = Array.from({ length: KEEP_MAX + 50 }, (_, i) => ({ id: String(i) }));
  expect(mergeListings(many, [], now)).toHaveLength(KEEP_MAX);
});
