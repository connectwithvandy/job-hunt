import { expect, test } from "vitest";
import { guideSteps, nextGuideStep } from "./lib/guide";

const start = { hasCv: true, roles: 2, contacts: 0, jobs: 40, scored: 0, tailored: 0, applied: 0 };

test("after setup, jobs come first: scoring is the next step, not LinkedIn", () => {
  expect(nextGuideStep(guideSteps(start), false)?.key).toBe("score");
  expect(guideSteps(start).at(-1)?.key).toBe("connections");
});

test("connections come back as the only step left", () => {
  expect(nextGuideStep(guideSteps({ ...start, scored: 5, tailored: 1, applied: 1 }), true)?.key).toBe("connections");
});

test("nothing left when everything is done", () => {
  expect(nextGuideStep(guideSteps({ ...start, contacts: 10, scored: 5, tailored: 1, applied: 1 }), false)).toBe(null);
});
