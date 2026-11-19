import { describe, expect, it } from "vitest";
import { interviewerFirstName, thankYouNote } from "./thankYou";

describe("thank-you note", () => {
  it("greets the interviewer by first name", () => {
    expect(interviewerFirstName("Timothy Joseph <timothy.joseph@rippling.com>")).toBe("Timothy");
    expect(interviewerFirstName("ElevenLabs Hiring Team <no-reply@ashbyhq.com>")).toBe("");
    expect(interviewerFirstName("jobs@company.com")).toBe("");
  });
  it("names the role and company and signs with the member's first name", () => {
    const n = thankYouNote({ interviewer: "Timothy", company: "Rippling", role: "Sales Development, Direct - Outbound - SMB", myName: "Vandana Agarwal" });
    expect(n.body.startsWith("Hi Timothy,")).toBe(true);
    expect(n.body).toContain("role at Rippling");
    expect(n.body.endsWith("Vandana")).toBe(true);
    expect(n.subject).toBe("Thank you – Sales Development, Direct - Outbound - SMB");
  });
});
