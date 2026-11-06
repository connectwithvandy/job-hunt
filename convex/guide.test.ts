import { expect, test } from "vitest";
import { guideSteps, nextGuideStep } from "./lib/guide";

const start = { hasCv: true, roles: 2, contacts: 0, jobs: 40, scored: 0, tailored: 0, applied: 0 };

test("after setup, LinkedIn connections come first", () => {
  expect(nextGuideStep(guideSteps(start), false)?.key).toBe("connections");
});

test("once connections are requested, the next step comes up while LinkedIn prepares the file", () => {
  expect(nextGuideStep(guideSteps(start), true)?.key).toBe("score");
});

test("connections come back as the only step left", () => {
  expect(nextGuideStep(guideSteps({ ...start, scored: 5, tailored: 1, applied: 1 }), true)?.key).toBe("connections");
});

test("nothing left when everything is done", () => {
  expect(nextGuideStep(guideSteps({ ...start, contacts: 10, scored: 5, tailored: 1, applied: 1 }), false)).toBe(null);
});
