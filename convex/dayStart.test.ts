import { expect, test } from "vitest";
import { dayStart, timeAgo } from "../src/components/bits";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

test("a day runs from 4 AM to 4 AM, so late-night work counts toward the day before", () => {
  expect(dayStart(at(31, 23, 30))).toBe(at(31, 4));
  expect(dayStart(at(32, 1, 15))).toBe(at(31, 4));
  expect(dayStart(at(32, 4))).toBe(at(32, 4));
  expect(dayStart(at(32, 9))).toBe(at(32, 4));
});

test("timeAgo says today for something done before midnight when it's 1 AM", () => {
  const real = Date.now;
  Date.now = () => at(32, 1, 15);
  try {
    expect(timeAgo(at(31, 22))).toBe("today");
    expect(timeAgo(at(30, 22))).toBe("yesterday");
  } finally {
    Date.now = real;
  }
});
