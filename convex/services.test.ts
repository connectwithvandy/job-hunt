import { expect, test } from "vitest";
import { servicesDown, servicesSection, type ServiceFacts } from "./lib/services";

const ok: ServiceFacts = { ai: null, dreamwork: null, apify: { used: 2.5, limit: 9 }, google: { used: 40, budget: 190 } };

test("all working: no warnings, no alarm", () => {
  const s = servicesSection(ok);
  expect(s.alarm).toBe(false);
  expect(s.text).toContain("AI (Anthropic): working");
  expect(s.text).toContain("$2.50 of $9.00 used");
  expect(s.text).not.toContain("WARNING");
  expect(servicesDown(ok)).toBe(false);
});

test("AI out of credit: warning and its own email", () => {
  const f = { ...ok, ai: "credit balance is too low" };
  expect(servicesSection(f).text).toContain("WARNING: the AI (Anthropic) isn't answering: credit balance is too low");
  expect(servicesDown(f)).toBe(true);
});

test("allowances running out warn in the morning email but don't send alert emails", () => {
  const f = { ...ok, apify: { used: 8.5, limit: 9 }, google: { used: 190, budget: 190 } };
  const s = servicesSection(f);
  expect(s.alarm).toBe(true);
  expect(s.text).toContain("Apify has used $8.50");
  expect(s.text).toContain("Google Jobs searches are used up");
  expect(servicesDown(f)).toBe(false);
});

test("Apify errors count as down", () => {
  expect(servicesDown({ ...ok, apify: { error: "answered 401" } })).toBe(true);
});
