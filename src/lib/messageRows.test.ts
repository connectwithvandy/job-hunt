import { describe, expect, it } from "vitest";
import { companyLine, personRows, type OutreachJob } from "./messageRows";

const DAY = 86_400_000;
const now = 100 * DAY;

describe("companyLine", () => {
  it("asks how an interview went once it has ended", () => {
    const j = { status: "interview", meetingEndAt: now - DAY, lastEmail: { at: now - 3 * DAY, stage: "interview" } };
    expect(companyLine(j, now)).toEqual({ text: "Interview done · how did it go?", needs: true });
  });
  it("flags an unanswered invite and stays quiet for receipts", () => {
    expect(companyLine({ status: "applied", lastEmail: { at: now - DAY, stage: "interview" } }, now)).toEqual({ text: "Interview invite · answer it", needs: true });
    expect(companyLine({ status: "applied", lastEmail: { at: now - DAY, stage: "applied", repliedAt: now - DAY } }, now)).toEqual({ text: "Application received", needs: false });
  });
});

describe("personRows", () => {
  const job = (over: Partial<OutreachJob>): OutreachJob => ({ _id: "j1", company: "Rippling", title: "SDR Manager", updatedAt: now - DAY, outreach: [], hiringContacts: [], ...over });

  it("puts a due follow-up first, then notes not sent, then waiting, then replies", () => {
    const rows = personRows(
      [
        job({
          outreach: [
            { contactId: "a", name: "Asha Rao", status: "replied", sentAt: now - 5 * DAY },
            { contactId: "b", name: "Rahul Sikder", status: "sent", sentAt: now - DAY },
            { contactId: "c", name: "Archit Hota", status: "sent", sentAt: now - 6 * DAY },
            { contactId: "d", name: "Shubham J", status: "draft" },
          ],
        }),
      ],
      now,
    );
    expect(rows.map((r) => r.name)).toEqual(["Archit Hota", "Shubham J", "Rahul Sikder", "Asha Rao"]);
    expect(rows[0].line).toBe("Follow-up due · asked 6 days ago");
    expect(rows[0].needs).toBe(true);
    expect(rows[2].line).toMatch(/^Waiting · follow-up /);
  });

  it("gives a written hiring-manager note with nobody saved one quiet row", () => {
    const rows = personRows([job({ directNote: "Hi" })], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "find", needs: false, line: "Note written · find who to send it to" });
  });

  it("tracks hiring contacts on the hiring-manager timing", () => {
    const rows = personRows([job({ directNote: "Hi", hiringContacts: [{ id: "h", name: "Priya N", sentAt: now - 8 * DAY }] })], now);
    expect(rows[0]).toMatchObject({ kind: "hr", needs: true, line: "Follow-up due · asked 8 days ago" });
  });
});
