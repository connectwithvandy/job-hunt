import { describe, expect, it } from "vitest";
import { isArchived, postingTime } from "./archive";

const DAY = 86_400_000;
const now = Date.parse("2026-11-19T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * DAY).toISOString();

describe("isArchived", () => {
  it("archives a posting older than the limit, whatever the source", () => {
    expect(isArchived({ status: "new", postedAt: daysAgo(90), _creationTime: now - DAY }, now)).toBe(true);
    expect(isArchived({ status: "new", postedAt: daysAgo(20), _creationTime: now - DAY }, now)).toBe(false);
  });
  it("uses the chosen limit", () => {
    const j = { status: "new", postedAt: daysAgo(20), _creationTime: now };
    expect(isArchived(j, now, 14)).toBe(true);
    expect(isArchived(j, now, 30)).toBe(false);
  });
  it("falls back to when we found it without a posting date", () => {
    expect(isArchived({ status: "new", _creationTime: now - 50 * DAY }, now)).toBe(true);
    expect(isArchived({ status: "new", postedAt: "not a date", _creationTime: now - 5 * DAY }, now)).toBe(false);
    expect(postingTime({ status: "new", _creationTime: 7 })).toBe(7);
  });
  it("archives closed postings at any age", () => {
    expect(isArchived({ status: "new", postedAt: daysAgo(1), _creationTime: now, liveCheck: { state: "closed" } }, now)).toBe(true);
  });
  it("never archives a job you started or applied to", () => {
    expect(isArchived({ status: "applying", postedAt: daysAgo(200), _creationTime: now }, now)).toBe(false);
    expect(isArchived({ status: "applied", postedAt: daysAgo(200), _creationTime: now, liveCheck: { state: "closed" } }, now)).toBe(false);
  });
});
