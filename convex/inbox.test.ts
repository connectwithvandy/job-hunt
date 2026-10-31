import { describe, expect, it } from "vitest";
import { jobFor, needsNoAnswer } from "./lib/inbox";

const job = (company: string) => ({ company, updatedAt: 1 });
const mail = (from: string, subject: string) => ({ id: "1", from, subject, snippet: "", date: "" });

describe("jobFor", () => {
  it("matches the company named in the subject", () => {
    expect(jobFor(mail("Careers <jobs@greenhouse.io>", "Thanks for applying to Axis Communications"), [job("Axis Communications")])?.company).toBe("Axis Communications");
  });
  it("matches a recruiter by their company's own domain", () => {
    expect(jobFor(mail("Priya Nair <priya@axis.com>", "SDR India: next round"), [job("Axis Communications")])?.company).toBe("Axis Communications");
  });
  it("ignores free mail and hiring-tool domains", () => {
    expect(jobFor(mail("Priya <priya@gmail.com>", "Next round"), [job("Gmailify Labs")])).toBeNull();
    expect(jobFor(mail("Team <no-reply@greenhouse.io>", "Your interview"), [job("Greenhouse Labs")])).toBeNull();
  });
});

describe("needsNoAnswer", () => {
  it("skips automatic confirmations from no-reply senders", () => {
    expect(needsNoAnswer({ from: "Acme <no-reply@ats.example.com>", subject: "Interview availability received", snippet: "Thanks for sharing your availability." })).toBe(true);
  });
  it("keeps real requests and people writing", () => {
    expect(needsNoAnswer({ from: "Sam <scheduling@ats.example.com>", subject: "Interview availability request", snippet: "Please share your availability" })).toBe(false);
    expect(needsNoAnswer({ from: "Lee <lee@acme.com>", subject: "Interview confirmed", snippet: "See you Tuesday" })).toBe(false);
  });
});
