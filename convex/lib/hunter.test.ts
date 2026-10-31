// Reading Hunter.io's answers and the company website, with made-up people and companies only.
import { describe, expect, test } from "vitest";
import { domainOf, isCompanyDomain, parseFinder, rootDomain, splitName } from "./hunter";

describe("parseFinder", () => {
  test("a found email with a valid check is verified", () => {
    const body = { data: { email: "Priya.Rao@Examplecorp.io", score: 97, verification: { date: "2026-10-01", status: "valid" } } };
    expect(parseFinder(200, body)).toEqual({ kind: "found", email: "priya.rao@examplecorp.io", score: 97, verified: true });
  });

  test("a found email Hunter couldn't check is only likely", () => {
    const body = { data: { email: "sam@examplecorp.io", score: 81.6, verification: { date: null, status: "accept_all" } } };
    expect(parseFinder(200, body)).toEqual({ kind: "found", email: "sam@examplecorp.io", score: 82, verified: false });
  });

  test("no email, or a broken one, is not found: never guessed", () => {
    expect(parseFinder(200, { data: { email: null, score: null, verification: null } })).toEqual({ kind: "none" });
    expect(parseFinder(200, { data: { email: "not an email", score: 50 } })).toEqual({ kind: "none" });
    expect(parseFinder(200, null)).toEqual({ kind: "none" });
  });

  test("Hunter's errors become plain answers", () => {
    expect(parseFinder(451, { errors: [{ id: "claimed_email", details: "x" }] })).toEqual({ kind: "claimed" });
    expect(parseFinder(429, {})).toEqual({ kind: "usedUp" });
    expect(parseFinder(400, { errors: [{ id: "invalid_domain", details: "x" }] })).toEqual({ kind: "badDomain" });
    expect(parseFinder(400, { errors: [{ id: "wrong_params", details: "Missing first_name" }] })).toEqual({ kind: "error", message: "Hunter.io: Missing first_name" });
    expect(parseFinder(401, {}).kind).toBe("error");
  });
});

describe("company website", () => {
  test("from links, emails and typed text", () => {
    expect(domainOf("https://www.Examplecorp.io/careers?x=1")).toBe("examplecorp.io");
    expect(domainOf("Asha Recruiter <asha@talent.examplecorp.io>")).toBe("talent.examplecorp.io");
    expect(domainOf("examplecorp.co.in")).toBe("examplecorp.co.in");
    expect(domainOf("Example Corp")).toBe("");
    expect(domainOf("")).toBe("");
  });

  test("subdomains go back to the main website", () => {
    expect(rootDomain("careers.examplecorp.io")).toBe("examplecorp.io");
    expect(rootDomain("jobs.examplecorp.co.in")).toBe("examplecorp.co.in");
    expect(rootDomain("examplecorp.io")).toBe("examplecorp.io");
  });

  test("job boards, hiring tools and free mail aren't the company", () => {
    expect(isCompanyDomain("examplecorp.io")).toBe(true);
    expect(isCompanyDomain("boards.greenhouse.io")).toBe(false);
    expect(isCompanyDomain("linkedin.com")).toBe(false);
    expect(isCompanyDomain("gmail.com")).toBe(false);
    expect(isCompanyDomain("")).toBe(false);
  });
});

describe("splitName", () => {
  test("first and last, without titles or letters after the name", () => {
    expect(splitName("Dr. Meera K. Iyer, MBA")).toEqual({ first: "Meera", last: "Iyer" });
    expect(splitName("  Rahul   Verma (he/him) ")).toEqual({ first: "Rahul", last: "Verma" });
    expect(splitName("Madonna")).toBeNull();
  });
});
