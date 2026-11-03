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
  expect(isSeekerPost("OPEN TO WORK | actively seeking new opportunities in business development", "BD Leader")).toBe(true);
});

test("the message fits a LinkedIn connect note", () => {
  expect(pitch("Ira M.").startsWith("Hi Ira,")).toBe(true);
  expect(pitch("Manish Rangari").length).toBeLessThanOrEqual(300);
});
