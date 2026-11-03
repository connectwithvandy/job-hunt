import { expect, test } from "vitest";
import { isSeekerPost, pitch, place } from "./growth";

test("job post places read cleanly", () => {
  expect(place("Pune-Maharashtra-India")).toBe("Pune");
  expect(place("Bengaluru, Karnataka, India")).toBe("Bengaluru");
  expect(place("Anywhere (Remote)")).toBe("Remote");
  expect(place("India Remote")).toBe("Remote");
  expect(place("Hybrid - Bengaluru")).toBe("Bengaluru");
});

test("hiring posts are left out of the open-to-work list", () => {
  expect(isSeekerPost("🚨 We’re hiring: Sales Development Representative (SDR) looking for", "Founder")).toBe(false);
  expect(isSeekerPost("I’m hiring an APJ BDR Leader. Looking for someone great", "Sales Leader")).toBe(false);
  expect(isSeekerPost("Open to work: looking for my next SDR role", "Recruiter & Sourcer")).toBe(false);
  expect(isSeekerPost("I'm looking for my next SDR role in Bengaluru", "SDR at Acme | SaaS")).toBe(true);
  expect(isSeekerPost("Open to work: Account Executive roles, India or remote", "Account Executive | B2B SaaS")).toBe(true);
});

test("only B2B sales and GTM people", () => {
  expect(isSeekerPost("OPEN TO WORK | Seeking ASM / RSM roles in solar across India", "Sales Manager, Solar Energy")).toBe(false);
  expect(isSeekerPost("Open to work in India, immediate joiner", "Admission & Business Development Leader | Test Prep")).toBe(false);
  expect(isSeekerPost("I'm looking for a sales role in Pune", "Software Engineer")).toBe(false);
});

test("only India-based people talking about their own search", () => {
  expect(isSeekerPost("Open to Work in Saudi Arabia | Sales, Business Development", "B2B Sales")).toBe(false);
  expect(isSeekerPost("I'm looking for my first role in sales. Louisville", "Bartender")).toBe(false);
  expect(isSeekerPost("If you're looking out for a job as an SDR or AE in India, read this", "Director of Sales")).toBe(false);
});

test("the message fits a LinkedIn connect note", () => {
  expect(pitch("Ira M.").startsWith("Hi Ira,")).toBe(true);
  expect(pitch("PRAASHANT PRIYADARSHI").startsWith("Hi Praashant,")).toBe(true);
  expect(pitch("Manish Rangari").length).toBeLessThanOrEqual(300);
});
