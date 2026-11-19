import { expect, test } from "vitest";
import { fitScale, GUESS_MAX, GUESS_SCALE, guessShown } from "./lib/guessScale";
import { byShownFit } from "./lib/posting";

test("the shown guess only rises, so guesses keep their order", () => {
  let last = -1;
  for (let raw = 0; raw <= 100; raw++) {
    const shown = guessShown(raw);
    expect(shown).toBeGreaterThanOrEqual(last);
    last = shown;
  }
});

test("a guess never reaches the tailor-worthy or strong-fit range", () => {
  for (let raw = -10; raw <= 120; raw++) expect(guessShown(raw)).toBeLessThan(GUESS_MAX);
  expect(GUESS_SCALE.every(([, y]) => y < GUESS_MAX)).toBe(true);
});

test("strong title and place matches reach the 60s; clear mismatches stay low", () => {
  // Before 19 Nov: 15 + raw x 0.4, so raw 95 showed 53 and raw 20 showed 23.
  // Refitted 19 Nov on 221 real scores.
  expect(guessShown(95)).toBe(66);
  expect(guessShown(90)).toBe(64);
  expect(guessShown(80)).toBe(55);
  expect(guessShown(50)).toBe(28);
  expect(guessShown(20)).toBe(15);
  expect(guessShown(0)).toBe(10);
});

test("real scores still sort ahead of the highest guess", () => {
  const j = { postedAt: undefined, liveCheck: undefined } as never;
  const rows = [
    { fit: undefined, guess: guessShown(100), j },
    { fit: 61, guess: 0, j },
  ];
  expect([...rows].sort(byShownFit)[0].fit).toBe(61);
});

test("fitScale suggests a rising, capped table from pairs", () => {
  const pairs: [number, number][] = [
    ...Array.from({ length: 10 }, () => [25, 30] as [number, number]),
    ...Array.from({ length: 10 }, () => [85, 72] as [number, number]),
    ...Array.from({ length: 10 }, () => [95, 64] as [number, number]),
    ...Array.from({ length: 3 }, () => [55, 99] as [number, number]),
  ];
  expect(fitScale(pairs)).toEqual([
    [25, 30],
    [85, 69],
    [95, 69],
  ]);
});
