import { expect, test } from "vitest";
import { applyBulletFixes } from "./facts";

const roles = [
  { id: "jumpcloud", bullets: ["Led 12 SDRs selling to CISOs across EMEA", "Built the outbound playbook"] },
  { id: "rubrik", bullets: ["Ran pipeline reviews"] },
];

test("puts each fixed bullet in place and says which bullet it replaced", () => {
  const out = applyBulletFixes(roles, [{ id: "jumpcloud", index: 0, text: "Led 12 SDRs across EMEA" }]);
  expect(out.experience[0].bullets).toEqual(["Led 12 SDRs across EMEA", "Built the outbound playbook"]);
  expect(out.experience[1]).toBe(roles[1]);
  expect(out.renamed.get("Led 12 SDRs selling to CISOs across EMEA")).toBe("Led 12 SDRs across EMEA");
  // The original list is left alone.
  expect(roles[0].bullets[0]).toBe("Led 12 SDRs selling to CISOs across EMEA");
});

test("ignores fixes for roles or bullets that aren't there, and empty fixes", () => {
  const out = applyBulletFixes(roles, [
    { id: "nope", index: 0, text: "x" },
    { id: "rubrik", index: 5, text: "x" },
    { id: "rubrik", index: -1, text: "x" },
    { id: "rubrik", index: 0.5, text: "x" },
    { id: "rubrik", index: 0, text: "  " },
  ]);
  expect(out.experience).toEqual(roles);
  expect(out.renamed.size).toBe(0);
});
