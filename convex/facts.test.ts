import { expect, test } from "vitest";
import { unverifiedNumbers } from "./lib/facts";

const master = { name: "Test", summary: "Led 8 SDRs; $4.2M pipeline in FY24." } as unknown as Parameters<typeof unverifiedNumbers>[0];

test("a number not in the master CV is flagged", () => {
  expect(unverifiedNumbers(master, ["Led 12 SDRs"])).toEqual(["12"]);
});

test("numbers from the master CV pass", () => {
  expect(unverifiedNumbers(master, ["Led 8 SDRs to $4.2M pipeline"])).toEqual([]);
});

test("the length of a call asked for in a letter isn't a claim", () => {
  expect(unverifiedNumbers(master, ["Open to a 15-minute call next week?", "a 20 min chat", "a 30 minute meeting"])).toEqual([]);
});

test("minutes that describe a result are still checked", () => {
  expect(unverifiedNumbers(master, ["Cut reply time to 15 minutes"])).toEqual(["15"]);
});
