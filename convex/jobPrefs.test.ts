import { describe, expect, it } from "vitest";
import { hiddenByPrefs, listedTopPayL, seniorityOf } from "./lib/jobPrefs";

describe("job preferences", () => {
  it("reads only pay the posting lists", () => {
    expect(listedTopPayL("₹20-30 LPA")).toBe(30);
    expect(listedTopPayL("₹2,200,000 – ₹3,600,000/year (est.)")).toBeNull();
    expect(listedTopPayL("USD 100,000 - 120,000/year")).toBeCloseTo(105.6);
    expect(listedTopPayL(null)).toBeNull();
    expect(listedTopPayL("Competitive")).toBeNull();
  });

  it("hides jobs with a blocked word in the title", () => {
    const prefs = { blockedWords: ["Trainer", "franchise"] };
    expect(hiddenByPrefs({ title: "Manager - Sales Trainer (US)" }, prefs)).toBe(true);
    expect(hiddenByPrefs({ title: "Inside Sales Manager, Franchise Sales" }, prefs)).toBe(true);
    expect(hiddenByPrefs({ title: "Account Executive" }, prefs)).toBe(false);
  });

  it("hides listed pay under the floor but keeps jobs with no listed pay", () => {
    const prefs = { minPayL: 25 };
    expect(hiddenByPrefs({ title: "AE", salary: "₹10-20 LPA" }, prefs)).toBe(true);
    expect(hiddenByPrefs({ title: "AE", salary: "₹20-30 LPA" }, prefs)).toBe(false);
    expect(hiddenByPrefs({ title: "AE", salary: null }, prefs)).toBe(false);
    expect(hiddenByPrefs({ title: "AE", salary: "₹5-8 L/yr (est.)" }, prefs)).toBe(false);
  });

  it("filters seniority only when some are picked", () => {
    expect(seniorityOf("Head of Sales, India")).toBe("director");
    expect(hiddenByPrefs({ title: "Account Executive" }, { levels: [] })).toBe(false);
    expect(hiddenByPrefs({ title: "Account Executive" }, { levels: ["manager", "director"] })).toBe(true);
    expect(hiddenByPrefs({ title: "SDR Manager" }, { levels: ["manager", "director"] })).toBe(false);
  });
});
