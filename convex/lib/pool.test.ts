import { expect, test } from "vitest";
import { settleLimited } from "./pool";

test("keeps order, reports failures, and never runs more than the limit at once", async () => {
  let running = 0;
  let most = 0;
  const out = await settleLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
    most = Math.max(most, ++running);
    await new Promise((done) => setTimeout(done, 1));
    running--;
    if (n === 3) throw new Error("no");
    return n * 2;
  });
  expect(most).toBe(2);
  expect(out.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"]);
  expect(out[5]).toEqual({ status: "fulfilled", value: 12 });
});
