import { expect, test } from "vitest";
import { rankFit, stalePenalty } from "./lib/posting";

const now = Date.parse("2026-11-14T00:00:00Z");
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

test("fresh jobs keep their fit; old ones sink; closed ones go last", () => {
  expect(stalePenalty({ postedAt: ago(5) }, now)).toBe(0);
  expect(stalePenalty({}, now)).toBe(0);
  expect(stalePenalty({ postedAt: ago(210) }, now)).toBe(25);
  expect(stalePenalty({ postedAt: ago(5), liveCheck: { state: "closed" } }, now)).toBe(100);
  // A 7-month-old 84 ranks below a fresh 66.
  expect(rankFit(84, { postedAt: ago(210) }, now)).toBeLessThan(rankFit(66, { postedAt: ago(5) }, now));
  // Not scored stays not scored, and a closed scored job stays scored (0), below the line.
  expect(rankFit(-1, { liveCheck: { state: "closed" } }, now)).toBe(-1);
  expect(rankFit(88, { liveCheck: { state: "closed" } }, now)).toBe(0);
});
