// The free first guess (0-100, from title, CV words and place) shown on the AI score's scale, with a "~".
//
// History: 1 Nov 2026 the shown guess was 15 + guess x 0.4 (414 jobs then: a raw 100 averaged an AI score of 56),
// so it could never pass 55. By 19 Nov the jobs people actually scored from the top of the list came back 60-84
// while their guesses read ~46-54, so good jobs looked weak until scored. The table below lifts the top end and
// keeps the bottom low. It is provisional until refitted from live pairs:
//   npx convex run --prod scoreSpread:calibrate '{"fromDaysAgo":30}'
// which prints a suggested GUESS_SCALE from the median AI score in each band of guesses.
//
// Rules the table must keep (tested in guessScale.test.ts):
// - it only ever rises, so the order between guesses never changes;
// - a guess never shows GUESS_MAX or more: 70+ means "worth a tailored CV" and 75+ "strong fit", and only a real
//   score that has read the whole job may say that.

/** [raw guess, shown number] points; values in between are drawn on a straight line. */
export const GUESS_SCALE: [number, number][] = [
  [0, 10],
  [30, 22],
  [50, 33],
  [70, 47],
  [85, 58],
  [100, 68],
];

/** A guess never shows this or more. */
export const GUESS_MAX = 70;

/** The number shown for a raw first guess, on the AI score's scale. */
export function guessShown(raw: number): number {
  const x = Math.max(0, Math.min(100, raw));
  if (x <= GUESS_SCALE[0][0]) return Math.min(GUESS_MAX - 1, GUESS_SCALE[0][1]);
  for (let i = 1; i < GUESS_SCALE.length; i++) {
    const [x0, y0] = GUESS_SCALE[i - 1];
    const [x1, y1] = GUESS_SCALE[i];
    if (x <= x1) return Math.min(GUESS_MAX - 1, Math.round(y0 + ((x - x0) * (y1 - y0)) / (x1 - x0)));
  }
  return Math.min(GUESS_MAX - 1, GUESS_SCALE[GUESS_SCALE.length - 1][1]);
}

/**
 * A suggested table from (raw guess, AI score) pairs: the median AI score in each 10-point band of guesses,
 * kept rising and under GUESS_MAX. Bands with fewer than `minPairs` pairs are skipped.
 */
export function fitScale(pairs: [number, number][], minPairs = 8): [number, number][] {
  const bands = new Map<number, number[]>();
  for (const [g, ai] of pairs) {
    const b = Math.min(90, Math.floor(Math.max(0, g) / 10) * 10);
    bands.set(b, [...(bands.get(b) ?? []), ai]);
  }
  const points: [number, number][] = [];
  let floor = 0;
  for (const b of [...bands.keys()].sort((a, c) => a - c)) {
    const ais = bands.get(b)!.sort((a, c) => a - c);
    if (ais.length < minPairs) continue;
    const median = ais[Math.floor(ais.length / 2)];
    // The middle of the band stands for it; rising and capped, so the table keeps its two rules.
    floor = Math.min(GUESS_MAX - 1, Math.max(floor, median));
    points.push([b + 5, floor]);
  }
  return points;
}
