// Reads when a meeting ends from a Google Calendar invite subject, so an interview that already happened
// stops asking to be answered. Shared by the backend (saved on the job) and the app.
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
