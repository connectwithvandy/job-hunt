// Where each way into a job stands: the application, a referral from someone you know, and a message to HR or
// the hiring manager. Apply is always the main step; the other two run alongside it, never before it
// (19 Nov, owner: "the apply button should be front-facing, but the follow-up strategy should be there").
import { nextFollowUp, REFERRAL_FOLLOW_UP_AFTER } from "../../convex/lib/followups";

const DAY = 86_400_000;

type FollowUp = { sentAt?: number };
type Ask = { name: string; status: "draft" | "sent" | "replied" | "referred"; sentAt?: number; followUps?: FollowUp[] };
type Hr = { name: string; sentAt?: number; repliedAt?: number; followUps?: FollowUp[] };

export type Track = {
  /** "todo" needs you now, "waiting" is out and ticking, "good" is a reply or a referral, "off" means nothing to do. */
  tone: "todo" | "waiting" | "good" | "off";
  line: string;
  /** The one button, or none. */
  action?: string;
};

const first = (name: string) => name.split(" ")[0] || name;
const ago = (at: number, now: number) => {
  const d = Math.floor((now - at) / DAY);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const day = (at: number) => new Date(at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** The next follow-up across these threads: "due now" or its day, or that both were sent. */
function chase(threads: { sentAt?: number; replied: boolean; followUps?: FollowUp[] }[], now: number, after?: number) {
  const next = threads
    .map((t) => nextFollowUp(t, after))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .sort((a, b) => a.dueAt - b.dueAt)[0];
  if (next) return { due: next.dueAt <= now, text: next.dueAt <= now ? `follow-up ${next.n} due now` : `follow-up ${next.n} on ${day(next.dueAt)}` };
  return { due: false, text: "both follow-ups sent" };
}

/** The referral track: who you asked, whether they answered, and when to chase. */
export function referralTrack(asks: Ask[], peopleCount: number, company: string, now: number): Track {
  const referred = asks.find((o) => o.status === "referred");
  if (referred) return { tone: "good", line: `${referred.name} referred you`, action: "See" };
  const replied = asks.find((o) => o.status === "replied");
  if (replied) return { tone: "good", line: `${replied.name} replied`, action: "Reply" };
  const sent = asks.filter((o) => o.status === "sent" && o.sentAt).sort((a, b) => b.sentAt! - a.sentAt!);
  if (sent.length) {
    const c = chase(sent.map((o) => ({ sentAt: o.sentAt, replied: false, followUps: o.followUps })), now, REFERRAL_FOLLOW_UP_AFTER);
    const who = sent.length > 1 ? `${first(sent[0].name)} and ${sent.length - 1} more` : first(sent[0].name);
    return { tone: c.due ? "todo" : "waiting", line: `Asked ${who} ${ago(sent[0].sentAt!, now)} · ${c.text}`, action: c.due ? "Follow up" : "Open" };
  }
  const drafted = asks.filter((o) => o.status === "draft");
  if (drafted.length) return { tone: "todo", line: `Note to ${first(drafted[0].name)}${drafted.length > 1 ? ` and ${drafted.length - 1} more` : ""} written, not sent yet`, action: "Send it" };
  if (peopleCount > 0) return { tone: "todo", line: `You know ${peopleCount} ${peopleCount === 1 ? "person" : "people"} at ${company}`, action: "Ask" };
  return { tone: "off", line: "No connections here. Message HR instead." };
}

/** The HR / hiring manager track: saved, messaged, chased, answered. */
export function hrTrack(contacts: Hr[], now: number): Track {
  const replied = contacts.find((c) => c.repliedAt);
  if (replied) return { tone: "good", line: `${replied.name} replied`, action: "Reply" };
  const sent = contacts.filter((c) => c.sentAt).sort((a, b) => b.sentAt! - a.sentAt!);
  if (sent.length) {
    const c = chase(sent.map((x) => ({ sentAt: x.sentAt, replied: false, followUps: x.followUps })), now);
    return { tone: c.due ? "todo" : "waiting", line: `Messaged ${first(sent[0].name)} ${ago(sent[0].sentAt!, now)} · ${c.text}`, action: c.due ? "Follow up" : "Open" };
  }
  if (contacts.length) return { tone: "todo", line: `${first(contacts[0].name)} saved, not messaged yet`, action: "Message" };
  return { tone: "todo", line: "Not contacted yet", action: "Find them" };
}

/** Applied in the last 3 days and nobody asked or messaged yet: suggest the next way in, or nothing. */
export function afterApplyNudge(
  job: { status: string; appliedAt?: number; outreach: Ask[]; hiringContacts?: Hr[] },
  knowsPeople: boolean,
  now: number,
): "referral" | "hr" | null {
  if (!job.appliedAt || now - job.appliedAt > 3 * DAY) return null;
  if (!["applied", "screening"].includes(job.status)) return null;
  if (job.outreach.some((o) => o.status !== "draft") || (job.hiringContacts ?? []).some((c) => c.sentAt)) return null;
  return knowsPeople ? "referral" : "hr";
}
