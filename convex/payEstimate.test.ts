import { describe, expect, test } from "vitest";
import { payEstimate, payEstimateText } from "./lib/payEstimate";

describe("payEstimate", () => {
  test("reads the band from the title", () => {
    expect(payEstimate({ title: "Sales Development Representative", location: "Bengaluru, India" })).toEqual({ low: 5, high: 10 });
    expect(payEstimate({ title: "Enterprise Account Executive", location: "Mumbai" })).toEqual({ low: 30, high: 60 });
    expect(payEstimate({ title: "Account Executive, Commercial & SMB (India)", location: "Bengaluru" })).toEqual({ low: 10, high: 20 });
    expect(payEstimate({ title: "Head of Sales", location: "Gurugram" })).toEqual({ low: 40, high: 80 });
    expect(payEstimate({ title: "SDR Manager", location: "Pune" })).toEqual({ low: 18, high: 35 });
  });

  test("senior and junior move individual roles, not leaders", () => {
    expect(payEstimate({ title: "Senior Account Executive", location: "Bengaluru" })).toEqual({ low: 20, high: 39 });
    expect(payEstimate({ title: "Associate Account Manager", location: "Chennai" })).toEqual({ low: 6, high: 14 });
    expect(payEstimate({ title: "Senior Director of Sales", location: "Bengaluru" })).toEqual({ low: 40, high: 80 });
  });

  test("smaller Indian cities get a bit less; remote India counts as a big city", () => {
    expect(payEstimate({ title: "Account Executive", location: "Kolkata, West Bengal" })).toEqual({ low: 12, high: 24 });
    expect(payEstimate({ title: "Account Executive", location: "Remote (India)" })).toEqual({ low: 15, high: 30 });
    expect(payEstimate({ title: "Account Executive", location: "Home Office (India)" })).toEqual({ low: 15, high: 30 });
  });

  test("no estimate outside India, for plain remote, interns or unknown titles", () => {
    expect(payEstimate({ title: "Account Executive", location: "London, UK" })).toBeNull();
    expect(payEstimate({ title: "Account Executive", location: "Remote" })).toBeNull();
    expect(payEstimate({ title: "Sales Intern", location: "Bengaluru" })).toBeNull();
    expect(payEstimate({ title: "Software Engineer", location: "Bengaluru" })).toBeNull();
  });

  test("text reads like listed pay", () => {
    expect(payEstimateText({ title: "BDR", location: "Hyderabad" })).toBe("₹5–10 L/yr");
  });

  test("titles seen on real boards", () => {
    expect(payEstimate({ title: "Executive - Retail Sales", location: "Bangalore, Karnataka, India" })).toEqual({ low: 3.5, high: 7 });
    expect(payEstimate({ title: "Senior Manager - Business Development", location: "Telangana,; India; Hyderabad" })).toEqual({ low: 16, high: 33 });
    expect(payEstimate({ title: "Business Development Manager/Account Manager (Hyd)", location: "Hyderabad; India" })).toEqual({ low: 12, high: 25 });
    expect(payEstimate({ title: "Senior Territory Account Executive, Bengaluru", location: "Hybrid" })).toEqual({ low: 20, high: 39 });
    expect(payEstimate({ title: "Sales Development Representative (Outbound)", location: "India" })).toEqual({ low: 5, high: 10 });
  });
});
