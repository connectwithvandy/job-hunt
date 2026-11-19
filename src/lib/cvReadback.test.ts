import { describe, expect, it } from "vitest";
import { monthOf, readCv } from "./cvReadback";

const now = new Date(2026, 10, 19);

const cv = {
  headline: "Global sales development leader | APAC, EMEA and North America",
  summary: "Sales development leader with 8+ years.",
  experience: [
    { company: "JumpCloud", role: "Manager of Sales Development", start: "Nov 2025", end: "Present", bullets: ["Lead a 10-member SDR org through regional team leads.", "Delivered approximately $2.9M in Q1 FY26 Stage 1 pipeline."] },
    { company: "Rubrik", role: "Manager of Sales Development", start: "Sep 2024", end: "Oct 2025", bullets: ["Achieved 143%, 120% and 105% of team SQL targets.", "Partnered with Regional Directors."] },
    { company: "Branch", role: "Manager of NA Sales Development", start: "Jan 2024", end: "Aug 2024", bullets: ["Raised SAL conversion from 57% to 91% in 5 months."] },
    { company: "Grasim Industries", role: "Management Trainee", start: "Sep 2015", end: "Dec 2016", bullets: ["Ran SAP based finance operations."] },
  ],
  skills: { technical: ["Salesforce", "Outreach", "Gong", "Salesforce"], soft: ["Coaching"] },
};

describe("monthOf", () => {
  it("reads month and year, a bare year, and Present", () => {
    expect(monthOf("Nov 2025", now)).toBe(2025 * 12 + 10);
    expect(monthOf("2019", now)).toBe(2019 * 12);
    expect(monthOf("Present", now)).toBe(2026 * 12 + 10);
    expect(monthOf("", now)).toBeNull();
  });
});

describe("readCv", () => {
  it("pulls the current role, years, last three roles, regions, skills and numbers", () => {
    const r = readCv(cv, now)!;
    expect(r.current).toBe("Manager of Sales Development at JumpCloud");
    expect(r.years).toBe(11);
    expect(r.roles.map((x) => x.company)).toEqual(["JumpCloud", "Rubrik", "Branch"]);
    expect(r.roles[0].when).toBe("Nov 2025 – Present");
    expect(r.regions).toEqual(expect.arrayContaining(["APAC", "EMEA", "North America"]));
    expect(r.skills).toEqual(["Salesforce", "Outreach", "Gong"]);
    expect(r.numbers.length).toBe(4);
    expect(r.numbers.some((n) => n.includes("$2.9M"))).toBe(true);
    expect(r.numbers.some((n) => n.includes("Partnered"))).toBe(false);
  });

  it("returns null without a CV and copes with an empty one", () => {
    expect(readCv(null)).toBeNull();
    const r = readCv({ headline: "", summary: "", experience: [], skills: { technical: [], soft: [] } }, now)!;
    expect(r.current).toBeNull();
    expect(r.years).toBeNull();
    expect(r.numbers).toEqual([]);
  });
});
