import { expect, test } from "vitest";
import { setupHelpEmail } from "./lib/email";

test("setup help email holds only the steps each person still needs", () => {
  const both = setupHelpEmail({ name: "ganesh more", kind: "both" });
  expect(both.text).toMatch(/^Hi Ganesh,/);
  expect(both.text).toContain("1. Connect Gmail");
  expect(both.text).toContain("2. Load your LinkedIn connections");
  expect(both.text).toContain("Go to JobPipe (unsafe)");
  const gmail = setupHelpEmail({ kind: "gmail" });
  expect(gmail.text).toMatch(/^Hi,/);
  expect(gmail.text).toContain("Connect Gmail");
  expect(gmail.text).not.toContain("LinkedIn connections");
  const linkedin = setupHelpEmail({ name: "Anisha", kind: "linkedin" });
  expect(linkedin.text).not.toContain("Connect Gmail");
  expect(linkedin.text).toContain("no need to unzip");
  expect(linkedin.subject).toBe("One quick setup: see who you know at every company");
});
