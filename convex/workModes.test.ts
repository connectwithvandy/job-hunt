import { describe, expect, test } from "vitest";
import { fitsModes, normalizePlace, readWorkModes } from "./lib/defaults";

describe("work types", () => {
  test("old Remote setting reads as remote only, anywhere", () => {
    expect(readWorkModes("Remote")).toEqual(["remote"]);
    expect(readWorkModes("Bengaluru")).toEqual(["onsite", "hybrid", "remote"]);
  });

  test("anywhere + remote only is saved as Remote, which the search knows", () => {
    expect(normalizePlace("Anywhere", ["remote"])).toEqual({ location: "Remote", workModes: ["remote"] });
    expect(normalizePlace("Remote", ["remote", "hybrid"])).toEqual({ location: "Anywhere", workModes: ["hybrid", "remote"] });
  });

  test("all three work types save as no filter", () => {
    expect(normalizePlace("Bengaluru, Pune", ["remote", "onsite", "hybrid"])).toEqual({ location: "Bengaluru, Pune", workModes: undefined });
    expect(normalizePlace("", undefined)).toEqual({ location: "India", workModes: undefined });
  });

  test("Bengaluru, no remote: drops remote jobs, keeps unlabelled ones", () => {
    const modes = ["onsite", "hybrid"] as const;
    expect(fitsModes([...modes], "Remote, India", undefined)).toBe(false);
    expect(fitsModes([...modes], "Bengaluru", "remote")).toBe(false);
    expect(fitsModes([...modes], "Bengaluru, Karnataka", undefined)).toBe(true);
    expect(fitsModes([...modes], "Bengaluru (Hybrid)", undefined)).toBe(true);
  });

  test("remote only drops office and unlabelled jobs", () => {
    expect(fitsModes(["remote"], "Bengaluru", undefined)).toBe(false);
    expect(fitsModes(["remote"], "Bengaluru", "on_site")).toBe(false);
    expect(fitsModes(["remote"], "India", "remote")).toBe(true);
  });

  test("hybrid only keeps hybrid, drops remote and labelled office", () => {
    expect(fitsModes(["hybrid"], "Mumbai", "hybrid")).toBe(true);
    expect(fitsModes(["hybrid"], "Mumbai", "onsite")).toBe(false);
    expect(fitsModes(["hybrid"], "Remote", undefined)).toBe(false);
  });
});
