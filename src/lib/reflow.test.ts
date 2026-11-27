import { expect, test } from "vitest";
import { reflow, tidyPlace } from "./tidy";

test("a posting with lost line breaks gets sections, bullets and paragraphs back", () => {
  const out = reflow("We sell to banks and lenders across India.Our team is small. KEY RESPONSIBILITIES Own the pipeline. • Run demos • Close deals One. Two. Three. Four. Five.");
  expect(out).toContain("India. Our");
  expect(out).toContain("\nKEY RESPONSIBILITIES\n");
  expect(out).toContain("\n• Run demos");
  expect(out.split("\n").length).toBeGreaterThan(4);
});

test("a posting that already has line breaks is left alone", () => {
  const text = "About us\nWe build.\nWhat you'll do\nSell.";
  expect(reflow(text)).toBe(text);
});

test("short acronyms like SaaS B2B are not turned into headings", () => {
  expect(reflow("Sell our B2B SaaS CRM to IT teams.")).toBe("Sell our B2B SaaS CRM to IT teams.");
});


test("a role in two Indian cities names both, Bengaluru first", () => {
  expect(tidyPlace("Mumbai; Bengaluru (Remote)")).toBe("Bengaluru, Mumbai");
  expect(tidyPlace("Mumbai / Bengaluru")).toBe("Bengaluru, Mumbai");
  expect(tidyPlace("Biba Indira Nagar, Bengaluru")).toBe("Bengaluru");
  expect(tidyPlace("Pune, Mumbai, Delhi, Bengaluru")).toBe("Bengaluru, Pune +2");
});
