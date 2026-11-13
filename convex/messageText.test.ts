import { expect, test } from "vitest";
import { tidyMessage } from "./lib/messageText";

test("a one-block referral note gets a greeting line, short paragraphs and the ask together", () => {
  const note =
    "Hey Archit, you're on SME & Growth at Airwallex, so you'll know this one better than me. I've applied for the Manager, Inbound Sales role: https://jobs.ashbyhq.com/airwallex/5a6bb3bc. At Branch I raised SAL conversion from 57% to 91% in 5 months. Would you be comfortable referring me? Totally fine if not. CV attached.";
  expect(tidyMessage(note)).toBe(
    "Hey Archit,\n\nYou're on SME & Growth at Airwallex, so you'll know this one better than me. I've applied for the Manager, Inbound Sales role: https://jobs.ashbyhq.com/airwallex/5a6bb3bc.\n\nAt Branch I raised SAL conversion from 57% to 91% in 5 months.\n\nWould you be comfortable referring me? Totally fine if not. CV attached.",
  );
});

test("a note already in paragraphs is left as written", () => {
  const note = "Hi Priya,\n\nQuick one.\n\nThanks!";
  expect(tidyMessage(note)).toBe(note);
});

test("decimals and links don't split a sentence", () => {
  expect(tidyMessage("Grew ARR 3.5x at Acme.io in a year. Would you refer me?")).toBe("Grew ARR 3.5x at Acme.io in a year.\n\nWould you refer me?");
});
