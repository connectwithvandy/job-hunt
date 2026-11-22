import { describe, expect, it } from "vitest";
import { cleanCompany } from "./company";

describe("cleanCompany", () => {
  it("unglues a careers-site id with the legal suffix", () => {
    expect(cleanCompany("Razorpaysoftwareprivatelimited")).toBe("Razorpay");
    expect(cleanCompany("Acmepvtltd")).toBe("Acme");
  });
  it("blanks a country code or a tagline", () => {
    expect(cleanCompany("US")).toBe("");
    expect(cleanCompany("Rewardsentives, Payouts, Perks, Loyalty & Engagement")).toBe("");
  });
  it("keeps real names", () => {
    for (const n of ["Databricks", "PHONEPE LIMITED", "Weekday (YC W21)", "Edumilestones.com", "Unlimited", "Salesforce, Inc."]) expect(cleanCompany(n)).toBe(n);
    expect(cleanCompany("GoKwik GoKwik")).toBe("GoKwik");
  });
});
