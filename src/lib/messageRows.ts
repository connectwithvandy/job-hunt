// The two lists on Messages (19 Nov rebuild): one row per company that emailed you, and one row per person you
// asked or wrote to. Each row says, in a few plain words, where it stands and whether it needs you. No AI.
import { FOLLOW_UP_AFTER, nextFollowUp, REFERRAL_FOLLOW_UP_AFTER } from "../../convex/lib/followups";
import { justInterviewed, waitsForAnswer } from "./replies";

type EmailJob = {
  status: string;
  meetingEndAt?: number;
  statusSetAt?: number;
  lastEmail?: { at: number; stage: string; repliedAt?: number; subject?: string };
};

/** The one line under a company in "From companies": what their latest email means for you. */
export function companyLine(j: EmailJob, now: number): { text: string; needs: boolean } {
  const stage = j.lastEmail?.stage ?? "";
  if (justInterviewed(j, now)) return { text: "Interview done · how did it go?", needs: true };
  if (waitsForAnswer(j, now)) {
    const what = stage === "offer" ? "Offer" : stage === "interview" ? "Interview invite" : "Recruiter wrote";
    return { text: `${what} · answer it`, needs: true };
  }
  const plain: Record<string, string> = {
    applied: "Application received",
    screening: "Recruiter wrote",
    interview: "Interview invite",
    offer: "Offer",
    rejected: "They said no",
  };
  return { text: plain[stage] ?? "Email", needs: false };
}

type Ask = { contactId: string; name: string; status: string; sentAt?: number; followUps?: { sentAt?: number }[] };
type Contact = { id: string; name: string; sentAt?: number; repliedAt?: number; followUps?: { sentAt?: number }[] };
export type OutreachJob = { _id: string; company: string; title: string; updatedAt: number; directNote?: string; outreach: Ask[]; hiringContacts: Contact[] };

export type PersonRow = {
  key: string;
  kind: "referral" | "hr" | "find";
  jobId: string;
  company: string;
  title: string;
  name: string;
  line: string;
  needs: boolean;
  /** 0 follow-up due, 1 written not sent, 2 waiting, 3 find the person, 4 replied or referred. */
  rank: number;
  at: number;
};

const DAY = 86_400_000;
const daysAgo = (at: number, now: number) => {
  const d = Math.max(0, Math.floor((now - at) / DAY));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const weekday = (at: number) => new Date(at).toLocaleDateString("en-IN", { weekday: "short" });

/** Where a sent message stands: a follow-up is due, or it's waiting until a given day, or no more follow-ups. */
function waiting(t: { sentAt: number; followUps?: { sentAt?: number }[] }, after: number, now: number) {
  const next = nextFollowUp({ sentAt: t.sentAt, replied: false, followUps: t.followUps }, after);
  if (next && next.dueAt <= now) return { line: `Follow-up due · asked ${daysAgo(t.sentAt, now)}`, needs: true, rank: 0 };
  if (next) return { line: `Waiting · follow-up ${weekday(next.dueAt)}`, needs: false, rank: 2 };
  return { line: "Waiting · both follow-ups sent", needs: false, rank: 2 };
}

/** One row per person: referral asks and hiring-manager or HR contacts, most urgent first, then newest. */
export function personRows(jobs: OutreachJob[], now: number): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const j of jobs) {
    const base = { jobId: j._id, company: j.company, title: j.title };
    for (const o of j.outreach) {
      const at = o.sentAt ?? j.updatedAt;
      const key = `ref:${j._id}:${o.contactId}`;
      if (o.status === "draft") rows.push({ ...base, key, kind: "referral", name: o.name, line: "Written, not sent yet", needs: true, rank: 1, at });
      else if (o.status === "referred") rows.push({ ...base, key, kind: "referral", name: o.name, line: "Referred you", needs: false, rank: 4, at });
      else if (o.status === "replied") rows.push({ ...base, key, kind: "referral", name: o.name, line: "Replied", needs: false, rank: 4, at });
      else rows.push({ ...base, key, kind: "referral", name: o.name, ...waiting({ sentAt: at, followUps: o.followUps }, REFERRAL_FOLLOW_UP_AFTER, now), at });
    }
    for (const c of j.hiringContacts) {
      const key = `hr:${j._id}:${c.id}`;
      const at = c.sentAt ?? j.updatedAt;
      if (c.repliedAt) rows.push({ ...base, key, kind: "hr", name: c.name, line: "Replied", needs: false, rank: 4, at: c.repliedAt });
      else if (c.sentAt) rows.push({ ...base, key, kind: "hr", name: c.name, ...waiting({ sentAt: c.sentAt, followUps: c.followUps }, FOLLOW_UP_AFTER, now), at });
      else if (j.directNote) rows.push({ ...base, key, kind: "hr", name: c.name, line: "Written, not sent yet", needs: true, rank: 1, at });
      else rows.push({ ...base, key, kind: "hr", name: c.name, line: "Saved · nothing written yet", needs: false, rank: 3, at });
    }
    // A note for the hiring manager is written but nobody's saved to send it to: one quiet row, not a nag.
    if (j.directNote && !j.hiringContacts.length) {
      rows.push({ ...base, key: `find:${j._id}`, kind: "find", name: "Hiring manager", line: "Note written · find who to send it to", needs: false, rank: 3, at: j.updatedAt });
    }
  }
  return rows.sort((a, b) => a.rank - b.rank || b.at - a.at);
}

/** "Rahul Sikder" → "Rahul"; "Hiring manager" stays as it is. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
