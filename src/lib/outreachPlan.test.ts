import { describe, expect, it } from "vitest";
import { afterApplyNudge, hrTrack, referralTrack } from "./outreachPlan";

const DAY = 86_400_000;
const now = 100 * DAY;

describe("referralTrack", () => {
  it("offers to ask when you know people and haven't asked", () => {
    expect(referralTrack([], 6, "HubSpot", now)).toMatchObject({ tone: "todo", line: "You know 6 people at HubSpot", action: "Ask" });
  });
  it("points to HR when you know nobody there", () => {
    const t = referralTrack([], 0, "HubSpot", now);
    expect(t.tone).toBe("off");
    expect(t.action).toBeUndefined();
  });
  it("says a written note isn't sent yet", () => {
    expect(referralTrack([{ name: "Rahul Sikder", status: "draft" }], 6, "HubSpot", now).line).toBe("Note to Rahul written, not sent yet");
  });
  it("shows when the follow-up is due, two days after the ask", () => {
    const asked = [{ name: "Rahul Sikder", status: "sent" as const, sentAt: now - 1 * DAY }];
    expect(referralTrack(asked, 6, "HubSpot", now)).toMatchObject({ tone: "waiting", action: "Open" });
    expect(referralTrack(asked, 6, "HubSpot", now + 2 * DAY)).toMatchObject({ tone: "todo", action: "Follow up" });
    expect(referralTrack(asked, 6, "HubSpot", now + 2 * DAY).line).toContain("follow-up 1 due now");
  });
  it("stops chasing after two follow-ups and celebrates a referral", () => {
    const done = [{ name: "Rahul Sikder", status: "sent" as const, sentAt: now - 6 * DAY, followUps: [{ sentAt: now - 4 * DAY }, { sentAt: now - 2 * DAY }] }];
    expect(referralTrack(done, 6, "HubSpot", now).line).toContain("both follow-ups sent");
    expect(referralTrack([{ name: "Rahul Sikder", status: "referred" }], 6, "HubSpot", now)).toMatchObject({ tone: "good", line: "Rahul Sikder referred you" });
  });
});

describe("hrTrack", () => {
  it("moves from find, to message, to follow up a week later", () => {
    expect(hrTrack([], now).action).toBe("Find them");
    expect(hrTrack([{ name: "Timothy Joseph" }], now).line).toBe("Timothy saved, not messaged yet");
    expect(hrTrack([{ name: "Timothy Joseph", sentAt: now - 8 * DAY }], now)).toMatchObject({ tone: "todo", action: "Follow up" });
    expect(hrTrack([{ name: "Timothy Joseph", sentAt: now - DAY, repliedAt: now }], now).tone).toBe("good");
  });
});

describe("afterApplyNudge", () => {
  const job = { status: "applied", appliedAt: now - DAY, outreach: [], hiringContacts: [] };
  it("suggests a referral when you know people, else HR", () => {
    expect(afterApplyNudge(job, true, now)).toBe("referral");
    expect(afterApplyNudge(job, false, now)).toBe("hr");
  });
  it("stays quiet once you've reached out, or after three days", () => {
    expect(afterApplyNudge({ ...job, hiringContacts: [{ name: "T", sentAt: now }] }, true, now)).toBeNull();
    expect(afterApplyNudge({ ...job, appliedAt: now - 4 * DAY }, true, now)).toBeNull();
    expect(afterApplyNudge({ ...job, status: "new" }, true, now)).toBeNull();
  });
});
