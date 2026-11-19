import { describe, expect, it } from "vitest";
import { cleanSubject, parseCalendarInvite } from "./calendarInvite";

const subject = "Invitation from an unknown sender: Interview Confirmation | Rippling - Vandana Agarwal @ Mon Nov 16, 2026 10:30pm - 11pm (IST) (connectwithvandanaa@gmail.com)";
const body = `This event isn't in your calendar yet
You haven't interacted with timothy.joseph@rippling.com before.
Add to calendar
https://calendar.google.com/calendar/marksenderasknown?mark_sender_as_known=Ch1jb25uZWN0d2l0aHZhbmRhbmFhQGdtYWlsLmNvbRIVdGltb3RoeS5qb3NlcGhAcmlwcGxpbmcuY29t

Interview Confirmation | Rippling - Vandana Agarwal
Monday Nov 16, 2026 ⋅ 10:30pm – 11pm
India Standard Time - Kolkata

Join with Google Meet
https://meet.google.com/ans-vznw-pjd?hs=224`;

describe("calendar invites", () => {
  it("reads title, time and Meet link from Google's invite email", () => {
    expect(parseCalendarInvite(subject, body)).toEqual({
      title: "Interview Confirmation | Rippling - Vandana Agarwal",
      when: "Mon Nov 16, 2026 10:30pm - 11pm (IST)",
      join: "https://meet.google.com/ans-vznw-pjd",
    });
  });

  it("strips the other prefixes and finds Zoom links", () => {
    const p = parseCalendarInvite("Updated invitation: Final round @ Tue Nov 24, 2026 3pm - 4pm (IST) (me@x.com)", "Join Zoom https://us02web.zoom.us/j/8812345678?pwd=abc");
    expect(p).toEqual({ title: "Final round", when: "Tue Nov 24, 2026 3pm - 4pm (IST)", join: "https://us02web.zoom.us/j/8812345678?pwd=abc" });
  });

  it("leaves ordinary emails alone", () => {
    expect(parseCalendarInvite("ElevenLabs | Application Received", "Thanks for applying")).toBeNull();
    expect(cleanSubject("Thanks for applying to Stripe!")).toBe("Thanks for applying to Stripe!");
  });

  it("cleans the subject for lists", () => {
    expect(cleanSubject(subject)).toBe("Interview Confirmation | Rippling - Vandana Agarwal @ Mon Nov 16, 2026 10:30pm - 11pm (IST)");
  });
});
