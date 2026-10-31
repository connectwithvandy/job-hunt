import { describe, expect, it } from "vitest";
import { jobFor } from "./lib/inbox";

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
