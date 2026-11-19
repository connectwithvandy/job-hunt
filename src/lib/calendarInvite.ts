// Calendar invites arrive as Google Calendar's own email: a subject like
// "Invitation from an unknown sender: Interview Confirmation | Rippling - Vandana Agarwal @ Mon Nov 16, 2026 10:30pm - 11pm (IST) (me@gmail.com)"
// and a body full of "This event isn't in your calendar yet" and long tracking links.
// These helpers turn that into a title, a time and a Join link, so Messages shows a clean card.

const PREFIX = /^\s*(?:updated invitation|invitation from an unknown sender|invitation|new event|accepted|declined|tentatively accepted)(?:\s+with note)?\s*:\s*/i;
const TRAILING_ADDRESS = /\s*\([^()]*@[^()]*\)\s*$/;
const JOIN = /https?:\/\/(?:meet\.google\.com\/[\w-]+|(?:[\w-]+\.)?zoom\.us\/j\/[^\s)>\]]+|teams\.microsoft\.com\/[^\s)>\]]+|teams\.live\.com\/[^\s)>\]]+)/i;

/** The subject without Google Calendar's "Invitation:" style prefix and the "(your@email)" at the end. */
export function cleanSubject(subject: string): string {
  return subject.replace(PREFIX, "").replace(TRAILING_ADDRESS, "").trim() || subject;
}

/** True when the email is Google Calendar's invite email rather than a person writing. */
export function isCalendarInvite(subject: string, body: string): boolean {
  return PREFIX.test(subject) || /calendar\.google\.com\/calendar|isn['’]t in your calendar yet|Invitation from Google Calendar/i.test(body);
}

export type Invite = { title: string; when: string; join?: string };

/** Title, time and Join link from a calendar invite email, or null when it isn't one. */
export function parseCalendarInvite(subject: string, body: string): Invite | null {
  if (!isCalendarInvite(subject, body)) return null;
  const clean = cleanSubject(subject);
  const at = clean.lastIndexOf(" @ ");
  const title = (at > 0 ? clean.slice(0, at) : clean).trim();
  const when = at > 0 ? clean.slice(at + 3).trim() : "";
  const join = body.match(JOIN)?.[0];
  return { title, when, ...(join ? { join } : {}) };
}
