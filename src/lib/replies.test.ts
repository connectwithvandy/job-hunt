import { describe, expect, it } from "vitest";
import { justInterviewed, trackerStatus, waitsForAnswer } from "./replies";

const DAY = 86_400_000;
const now = 100 * DAY;
const job = (status: string, stage: string, daysAgo: number, repliedAt?: number) => ({ status, lastEmail: { stage, at: now - daysAgo * DAY, repliedAt } });

describe("waitsForAnswer", () => {
  it("counts an unanswered invite under two weeks old, whatever the job says", () => {
    expect(waitsForAnswer(job("interview", "interview", 3), now)).toBe(true);
    expect(waitsForAnswer(job("new", "interview", 6), now)).toBe(true);
    expect(waitsForAnswer(job("screening", "interview", 10), now)).toBe(true);
  });
  it("drops answered, stale, receipts, and closed jobs", () => {
    expect(waitsForAnswer(job("interview", "interview", 3, now), now)).toBe(false);
    expect(waitsForAnswer(job("screening", "interview", 16), now)).toBe(false);
    expect(waitsForAnswer(job("applied", "applied", 1), now)).toBe(false);
    expect(waitsForAnswer(job("dismissed", "interview", 1), now)).toBe(false);
    expect(waitsForAnswer(job("rejected", "screening", 1), now)).toBe(false);
  });
});

describe("trackerStatus", () => {
  it("puts an interview invite under Interviewing", () => {
    expect(trackerStatus(job("screening", "interview", 16))).toBe("interview");
    expect(trackerStatus(job("applied", "interview", 1))).toBe("interview");
  });
  it("leaves other jobs where they are", () => {
    expect(trackerStatus(job("applied", "applied", 1))).toBe("applied");
    expect(trackerStatus(job("rejected", "interview", 1))).toBe("rejected");
  });
});

describe("trackerStatus respects a hand move", () => {
  it("keeps a card the person dragged back after the invite email", () => {
    const e = { at: 1000, stage: "interview" };
    expect(trackerStatus({ status: "screening", lastEmail: e })).toBe("interview");
    expect(trackerStatus({ status: "screening", lastEmail: e, statusSetAt: 2000 })).toBe("screening");
    expect(trackerStatus({ status: "applied", lastEmail: e, statusSetAt: 500 })).toBe("interview");
  });
});

describe("interviews that already happened", () => {
  const subject = "Interview Confirmation | Rippling - Vandana Agarwal @ Mon Nov 16, 2026 10:30pm - 11pm (IST) (me@gmail.com)";
  const end = Date.UTC(2026, 10, 16, 17, 30); // 11pm IST
  const job = { status: "interview", lastEmail: { at: end - 3 * DAY, stage: "interview", subject } };
  it("waits for an answer before the meeting, not after", () => {
    expect(waitsForAnswer(job, end - DAY)).toBe(true);
    expect(waitsForAnswer(job, end + 60_000)).toBe(false);
  });
  it("asks how it went for a week after", () => {
    expect(justInterviewed(job, end + DAY)).toBe(true);
    expect(justInterviewed(job, end + 8 * DAY)).toBe(false);
    expect(justInterviewed({ ...job, status: "rejected" }, end + DAY)).toBe(false);
  });
});
