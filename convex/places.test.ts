import { expect, test } from "vitest";
import { openTo, readPlace } from "./lib/sources";

const lucknow = readPlace("Lucknow");

test("a smaller Indian city is known to be in India", () => {
  expect(lucknow).toMatchObject({ kind: "place", country: "in" });
  expect(readPlace("Vadodara").kind === "place" && readPlace("Vadodara")).toMatchObject({ country: "in" });
});

test("someone in a smaller city gets their city, India-wide and India-open remote roles, not other cities", () => {
  expect(openTo(lucknow, "Lucknow, Uttar Pradesh, India")).toBe(true);
  expect(openTo(lucknow, "India")).toBe(true);
  expect(openTo(lucknow, "Remote, India", "remote")).toBe(true);
  expect(openTo(lucknow, "Bengaluru, Karnataka, India")).toBe(false);
  expect(openTo(lucknow, "Remote", "remote", "Account Executive")).toBe(false);
});

test("several cities at once: any of them counts", () => {
  const several = readPlace("Lucknow, Bengaluru, Delhi NCR");
  expect(several).toMatchObject({ kind: "place", country: "in" });
  expect(openTo(several, "Bengaluru, Karnataka, India")).toBe(true);
  expect(openTo(several, "Gurugram, Haryana")).toBe(true);
  expect(openTo(several, "Pune, India")).toBe(false);
});

test("the boards are asked for all of India when the person picked several or smaller cities", async () => {
  const { searchPlace } = await import("./lib/sources");
  expect(searchPlace("Bengaluru")).toBe("Bengaluru");
  expect(searchPlace("Lucknow")).toBe("India");
  expect(searchPlace("Bengaluru, Mumbai")).toBe("India");
  expect(searchPlace("Remote")).toBe("Remote");
  expect(searchPlace("United States")).toBe("United States");
});
