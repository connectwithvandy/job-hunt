// @vitest-environment node
import { describe, expect, test } from "vitest";
import { BOOKMARK_VERSION, FILL_SOURCE, liveBookmarklet } from "./autofill";

describe("autofill bookmark", () => {
  // The fill code is a string run on other sites, so nothing else checks it parses.
  test("the fill code is valid JavaScript", () => {
    expect(() => new Function(`return (${FILL_SOURCE});`)).not.toThrow();
  });

  test("the bookmark carries the version and never presses Submit", () => {
    const src = decodeURIComponent(liveBookmarklet("https://jobpipe.in").slice("javascript:".length));
    expect(src).toContain(`/fill?v=${BOOKMARK_VERSION}&`);
    expect(() => new Function(src)).not.toThrow();
    expect(FILL_SOURCE).not.toMatch(/\.submit\(|requestSubmit/);
  });
});
