import { expect, test } from "vitest";
import { shortPlace } from "./lib/posting";

test("long country list shortened, India first", () => {
  expect(shortPlace("Remote (Afghanistan, Australia, Bangladesh, Bhutan, India, Japan)")).toBe("Remote (India, Afghanistan, Australia and 3 more)");
});
test("short lists and plain places unchanged", () => {
  expect(shortPlace("Bengaluru, Karnataka, India")).toBe("Bengaluru, Karnataka, India");
  expect(shortPlace("Remote (India, Singapore)")).toBe("Remote (India, Singapore)");
  expect(shortPlace("Remote (India, Singapore, Japan, Korea)")).toBe("Remote (India, Singapore, Japan, Korea)");
});
