import { describe, expect, it } from "vitest";
import { jobFor, needsNoAnswer, roleNamed, titleFit } from "./lib/inbox";

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

describe("jobFor with a named role", () => {
  const eleven = [
    { company: "ElevenLabs", title: "SMB Lead - APAC", updatedAt: 3 },
    { company: "ElevenLabs", title: "Account Manager - India", updatedAt: 2 },
  ];
  const note = (snippet: string) => ({ id: "1", from: "ElevenLabs Hiring Team <no-reply@ashbyhq.com>", subject: "ElevenLabs | Application Received", snippet, date: "" });
  it("picks the job whose title the email names", () => {
    expect(jobFor(note("Thank you for your interest in joining ElevenLabs as a Account Manager - India ."), eleven)?.title).toBe("Account Manager - India");
    expect(jobFor(note("Thank you for your interest in joining ElevenLabs as a SMB Lead - APAC."), eleven)?.title).toBe("SMB Lead - APAC");
  });
  it("attaches nothing when the named role is none of yours", () => {
    const forwarded = { id: "2", from: "Dreamwork <notifications@dreamworkhq.com>", subject: "ElevenLabs received your application", snippet: "Hi Vandana, Thank you for your interest in joining ElevenLabs as a Sales Development Lead - North America.", date: "" };
    expect(jobFor(forwarded, eleven)).toBeNull();
  });
  it("falls back to the latest job when no role is named", () => {
    expect(jobFor(note("We have received your application."), eleven)?.title).toBe("SMB Lead - APAC");
  });
});

describe("roleNamed", () => {
  it("reads common ways of naming a role", () => {
    expect(roleNamed("Great News! We've Received Your Application for the Manager, Sales Development Position")).toBe("Manager, Sales Development");
    expect(roleNamed("Your application for our Account Executive - Startups, Grower (India) role at Stripe")).toBe("Account Executive - Startups, Grower (India)");
    expect(roleNamed("We will get back to you as soon as possible.")).toBeNull();
  });
  it("scores title overlap", () => {
    expect(titleFit("SMB Lead - APAC", "Sales Development Lead - North America")).toBeLessThan(0.6);
    expect(titleFit("Manager, Sales Development", "Manager, Sales Development")).toBe(1);
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
