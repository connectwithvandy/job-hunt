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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Minutes ahead of UTC for the zone names Google Calendar prints in brackets.
const ZONES: Record<string, number> = { ist: 330, utc: 0, gmt: 0, gst: 240, sgt: 480, bst: 60, cet: 60, cest: 120, est: -300, edt: -240, pst: -480, pdt: -420, cst: -360, cdt: -300, aest: 600, aedt: 660 };

/**
 * When a meeting ends, read from an invite subject like "… @ Mon Nov 16, 2026 10:30pm - 11pm (IST) (me@gmail.com)".
 * Null when there's no time in it. With no zone we assume India time, where members live.
 */
export function meetingEnd(subject: string): number | null {
  const m = subject.match(/(\w{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm))?(?:\s*\(([^)@]*)\))?/i);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return null;
  const to24 = (h: string, ap: string) => (Number(h) % 12) + (ap.toLowerCase() === "pm" ? 12 : 0);
  let hour = to24(m[4], m[6]);
  let min = Number(m[5] ?? 0);
  if (m[7] && m[9]) {
    hour = to24(m[7], m[9]);
    min = Number(m[8] ?? 0);
  }
  const zone = (m[10] ?? "").trim();
  const offset = /^GMT([+-])(\d{1,2}):?(\d{2})?$/i.test(zone)
    ? (() => {
        const z = zone.match(/^GMT([+-])(\d{1,2}):?(\d{2})?$/i)!;
        return (z[1] === "-" ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3] ?? 0));
      })()
    : (ZONES[zone.toLowerCase()] ?? 330);
  let end = Date.UTC(Number(m[3]), mon, Number(m[2]), hour, min) - offset * 60_000;
  // "11:30pm - 12:30am" ends the next day.
  if (m[7] && to24(m[7], m[9]) < to24(m[4], m[6])) end += 86_400_000;
  return end;
}
