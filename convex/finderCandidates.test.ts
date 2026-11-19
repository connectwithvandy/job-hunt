import { describe, expect, it } from "vitest";
import { countBySource, isRealCompany, mergeCandidates, rankByCount, type SourcedCandidate } from "./lib/finderCandidates";
import { companyKey } from "./lib/company";

describe("isRealCompany", () => {
  it("drops LinkedIn placeholders", () => {
    expect(isRealCompany("Self-employed")).toBe(false);
    expect(isRealCompany("Freelance")).toBe(false);
    expect(isRealCompany("Stealth Startup")).toBe(false);
    expect(isRealCompany("  ")).toBe(false);
    expect(isRealCompany("Rippling")).toBe(true);
  });
});

describe("rankByCount", () => {
  it("puts the most common company first and merges spellings", () => {
    expect(rankByCount(["Postman", "Rippling", "rippling", "Rippling Inc.", "Self-employed", "Postman"])[0]).toBe("Rippling");
    expect(rankByCount(["Postman", "Rippling", "rippling"])).toEqual(["Rippling", "Postman"]);
  });
});

describe("mergeCandidates", () => {
  const yc: SourcedCandidate = { name: "Acme AI", website: "acme.ai", from: "yc" };
  it("keeps the first source's entry and skips companies that have a board", () => {
    const out = mergeCandidates(
      [yc],
      [
        { name: "acme ai", website: "", from: "connections" },
        { name: "Chargebee", website: "", from: "connections" },
        { name: "Postman", website: "", from: "pool" },
      ],
      new Set([companyKey("Postman")]),
    );
    expect(out.map((c) => c.name)).toEqual(["Acme AI", "Chargebee"]);
    expect(out[0].website).toBe("acme.ai");
  });
  it("adds at most the cap from the extra sources", () => {
    const extra = Array.from({ length: 10 }, (_, i) => ({ name: `Company Number ${i}`, website: "", from: "pool" as const }));
    expect(mergeCandidates([yc], extra, new Set(), 3)).toHaveLength(4);
  });
});

describe("countBySource", () => {
  it("counts boards found per source", () => {
    expect(countBySource([{ from: "connections" }, { from: "pool" }, { from: "connections" }])).toBe("connections 2, pool 1");
    expect(countBySource([])).toBe("");
  });
});
