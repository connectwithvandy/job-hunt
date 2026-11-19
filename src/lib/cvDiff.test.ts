import { describe, expect, it } from "vitest";
import { compareLine, diffCv, newNumbers, overlap } from "./cvDiff";

const master = {
  headline: "Global Sales Development Leader",
  summary: "Sales development leader with 8+ years building inbound and outbound teams.",
  experience: [
    {
      id: "e1",
      company: "Rubrik",
      role: "Manager of Sales Development",
      bullets: [
        "Built and scaled Rubrik's North America Mid Market SDR function from scratch in Bangalore, leading an 8-member team.",
        "Achieved 143% of team SQL targets, generating $5.6M in qualified pipeline in the strongest quarter.",
        "Maintained 90% MQL follow-up compliance through clear SLAs.",
      ],
    },
  ],
};

describe("compareLine", () => {
  it("marks a word-for-word line as the same", () => {
    expect(compareLine("Maintained 90% MQL follow-up compliance through clear SLAs.", master.experience[0].bullets).kind).toBe("same");
  });
  it("marks a close rewording and shows what it was", () => {
    const l = compareLine("Hit 143% of team SQL targets and generated $5.6M qualified pipeline in the best quarter.", master.experience[0].bullets);
    expect(l.kind).toBe("reworded");
    expect(l.was).toContain("143%");
  });
  it("marks a line with no close master line as new", () => {
    expect(compareLine("Closed three seven-figure enterprise deals in EMEA.", master.experience[0].bullets).kind).toBe("new");
  });
});

describe("diffCv", () => {
  const tailored = {
    headline: "Global Sales Development Leader",
    summary: "Sales development leader with 8+ years building outbound teams for mid-market SaaS.",
    experience: [
      {
        id: "e1",
        company: "Rubrik",
        role: "Manager of Sales Development",
        bullets: ["Achieved 143% of team SQL targets, generating $5.6M in qualified pipeline in the strongest quarter.", "Ran a 12-person EMEA enterprise desk."],
      },
    ],
  };
  const d = diffCv(tailored, master);
  it("counts same, new and left-out lines", () => {
    expect(d.headline.kind).toBe("same");
    expect(d.roles[0].lines.map((l) => l.kind)).toEqual(["same", "new"]);
    expect(d.roles[0].leftOut).toHaveLength(2);
    expect(d.counts.leftOut).toBe(2);
  });
  it("treats an unknown role as new", () => {
    const x = diffCv({ ...tailored, experience: [{ id: "zz", company: "Acme", role: "VP", bullets: ["Did things."] }] }, master);
    expect(x.roles[0].newRole).toBe(true);
  });
});

describe("helpers", () => {
  it("overlap ignores small words", () => {
    expect(overlap("the team of SDRs", "SDRs team")).toBe(1);
  });
  it("finds numbers not in the master CV", () => {
    expect(newNumbers("Ran a 12-person desk at 143%", master)).toEqual(["12"]);
  });
});
