import { expect, test } from "vitest";
import { cvMatch, postingTerms, workText } from "./lib/cvMatch";

// Made up: a posting and a CV for nobody real.
const POST = `Sales Development Representative - Brightlane

About the role
Brightlane is hiring an SDR to drive outbound pipeline generation across APAC enterprise accounts.
You will own cold calling and cold email cadences in Outreach, and research accounts with Sales Navigator.
Log every touch in Salesforce and hit a monthly quota of meetings booked for our Account Executives.
You will qualify leads using MEDDICC and run short discovery calls.
Work closely with marketing on inbound leads and the ICP for each territory.
Experience selling SaaS to enterprise buyers. Experience with Salesforce and Outreach preferred.
Help shape our outbound playbook and partner with marketing on account research.
Strong account research habits and a love of account research.

What we offer
Health insurance, paid time off and a learning budget.
Brightlane is an equal opportunity employer and values diversity of gender and background.`;

const cv = (bullets: string[], technical: string[] = []) => ({
  headline: "Sales Development Representative",
  summary: "",
  experience: [{ company: "Northwind Labs", role: "SDR", blurb: "", bullets }],
  education: [],
  certifications: [],
  skills: { technical, soft: [] },
  extras: [],
});

test("perks and legal lines are dropped", () => {
  const text = workText(POST);
  expect(text).not.toMatch(/insurance|equal opportunity/i);
  expect(text).toMatch(/cold calling/);
});

test("finds known sales terms and the phrases the posting repeats", () => {
  const labels = postingTerms(POST, "Brightlane").map((t) => t.label);
  for (const t of ["SDR", "Outbound", "Pipeline generation", "APAC", "Enterprise", "Cold calling", "Cold email", "Outreach", "Sales Navigator", "Salesforce", "Quota", "Meetings booked", "MEDDICC", "Discovery calls", "Inbound", "ICP", "SaaS"]) {
    expect(labels, t).toContain(t);
  }
  expect(labels).toContain("account research");
  // The employer's name and perks never become terms.
  expect(labels.join(" ")).not.toMatch(/brightlane|insurance|time off/i);
});

test("a CV that uses the terms scores high; synonyms count", () => {
  const strong = cv(
    [
      "Booked 40 meetings a month from outbound cold calling and cold emails across APAC enterprise accounts",
      "Built pipeline with Outreach cadences and LinkedIn Sales Navigator; 120% of quota",
      "Qualified leads with MEDDICC on discovery calls, handed to Account Executives",
      "Worked inbound leads against the ICP; did account research for every SaaS target",
    ],
    ["SFDC"],
  );
  const m = cvMatch(POST, strong, "Brightlane");
  expect(m).not.toBeNull();
  expect(m!.score).toBeGreaterThanOrEqual(80);
  // "SFDC" is Salesforce.
  expect(m!.covered.map((t) => t.label)).toContain("Salesforce");
});

test("a thin CV scores low and lists what it's missing, most important first", () => {
  const thin = cv(["Answered customer emails and kept the CRM tidy"]);
  const m = cvMatch(POST, thin, "Brightlane")!;
  expect(m.score).toBeLessThan(30);
  const missing = m.missing.map((t) => t.label);
  expect(missing).toContain("Salesforce");
  expect(missing).toContain("MEDDICC");
  // Known terms said three times or more come before a phrase said twice.
  expect(m.missing[0].weight).toBe(2);
});

test("SDR and BDR are not treated as the same", () => {
  const m = cvMatch("BDR role. BDR team. Outbound and cold calling. Salesforce.", "SDR who did outbound cold calling in Salesforce")!;
  expect(m.missing.map((t) => t.label)).toContain("BDR");
});

test("a posting with almost nothing to compare gives no score", () => {
  expect(cvMatch("Join us. Great culture.", "Anything")).toBeNull();
});

test("doesn't ask for the company's slogan", () => {
  const post = "We build a smarter and safer world. A smarter and safer world starts with us.\nYou will own pipeline generation and book meetings with Salesforce.\nYou will own pipeline generation for APAC.";
  const labels = postingTerms(post, "Acme").map((t) => t.label.toLowerCase());
  expect(labels.some((l) => l.includes("safer"))).toBe(false);
});
