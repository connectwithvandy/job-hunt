import { expect, test } from "vitest";
import { resetEmail, welcomeEmail } from "./lib/email";

test("welcome email uses their first name and the role they asked for", () => {
  const m = welcomeEmail({ name: "Priya Sharma", role: "Account Executive", email: "priya@example.com" });
  expect(m.subject).toBe("Priya, you're in: JobPipe");
  expect(m.text).toContain("Hi Priya,");
  expect(m.text).toContain('Add "Account Executive" as your first role');
  expect(m.text).toContain("/?signin=1&email=priya%40example.com");
});

test("welcome email capitalises a name typed in lower case", () => {
  expect(welcomeEmail({ name: "vandy", email: "a@example.com" }).subject).toBe("Vandy, you're in: JobPipe");
});

test("welcome email still reads well with no name or role", () => {
  const m = welcomeEmail({ email: "a@example.com" });
  expect(m.subject).toBe("You're in: JobPipe");
  expect(m.text).toContain("Hi,");
  expect(m.text).not.toContain("undefined");
});

test("welcome email escapes what people typed", () => {
  expect(welcomeEmail({ name: "<b>x</b>", email: "a@example.com" }).html).not.toContain("<b>x</b>");
});

test("reset email carries the code", () => {
  expect(resetEmail("12345678").text).toContain("12345678");
});
