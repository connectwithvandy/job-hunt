import { describe, expect, it } from "vitest";
import { newNames, newNumbers, rewriteProblem } from "./lib/rewriteGuard";

const line = "Helped establish the APAC outbound team, growing pipeline from $66K to $624K with Gong coaching.";

describe("rewriteProblem", () => {
  it("accepts a shorter line with the same facts", () => {
    expect(rewriteProblem(line, "Helped set up APAC outbound, growing pipeline from $66K to $624K with Gong coaching.")).toBeNull();
  });
  it("rejects dropping shared credit", () => {
    expect(rewriteProblem(line, "Established APAC outbound, growing pipeline from $66K to $624K with Gong coaching.")).toMatch(/helped/);
  });
  it("rejects a new number", () => {
    expect(newNumbers(line, "Grew APAC pipeline 10x, from $66K to $624K.")).toEqual(["10x"]);
    expect(rewriteProblem(line, "Grew APAC pipeline 10x, from $66K to $624K.")).toMatch(/numbers/);
  });
  it("rejects a new tool or employer", () => {
    expect(newNames(line, "Built APAC outbound with Gong and Outreach, from $66K to $624K.")).toEqual(["Outreach"]);
  });
  it("lets a sentence start with a capital", () => {
    expect(newNames("grew pipeline fast", "Grew pipeline fast.")).toEqual([]);
  });
  it("rejects a longer line", () => {
    expect(rewriteProblem("Ran weekly coaching.", "Ran weekly coaching sessions for every single rep on the whole team, every week.")).toMatch(/longer/);
  });
});
