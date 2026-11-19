import { expect, test } from "vitest";
import { byShownFit, rankFit, stalePenalty } from "./lib/posting";

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

test("byShownFit follows the number people see: real scores, then guesses, age only as a tie", () => {
  const now = Date.parse("2026-11-19T00:00:00Z");
  const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
  type Row = { name: string; fit?: number; guess: number; j: { postedAt?: string; liveCheck?: { state: string } } };
  const rows: Row[] = [
    { name: "old84", fit: 84, guess: 0, j: { postedAt: ago(200) } },
    { name: "new60", fit: 60, guess: 0, j: { postedAt: ago(2) } },
    { name: "guess54", fit: undefined, guess: 54, j: { postedAt: ago(90) } },
    { name: "guess47", fit: undefined, guess: 47, j: { postedAt: ago(1) } },
    { name: "closed90", fit: 90, guess: 0, j: { postedAt: ago(1), liveCheck: { state: "closed" } } },
    { name: "new84", fit: 84, guess: 0, j: { postedAt: ago(3) } },
  ];
  expect([...rows].sort(byShownFit).map((r) => r.name)).toEqual(["new84", "old84", "new60", "guess54", "guess47", "closed90"]);
});
