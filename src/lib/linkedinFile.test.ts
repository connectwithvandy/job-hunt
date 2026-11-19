import { describe, expect, it } from "vitest";
import { checkLinkedInFile, fileSize } from "./linkedinFile";

describe("checkLinkedInFile", () => {
  it("asks for a file when none is chosen", () => {
    expect(checkLinkedInFile(null, "connections")).toEqual({ ok: false, message: "Choose the file LinkedIn sent you first." });
  });
  it("takes LinkedIn's zip as it is", () => {
    expect(checkLinkedInFile({ name: "Basic_LinkedInDataExport_11-19-2026.zip", size: 120_000 }, "connections").ok).toBe(true);
  });
  it("takes the right CSV", () => {
    expect(checkLinkedInFile({ name: "Connections.csv", size: 5000 }, "connections").ok).toBe(true);
    expect(checkLinkedInFile({ name: "messages.csv", size: 5000 }, "chats").ok).toBe(true);
  });
  it("names the mix-up for the wrong CSV", () => {
    const r = checkLinkedInFile({ name: "Profile.csv", size: 900 }, "connections");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Connections.csv");
  });
  it("turns away other files and empty ones", () => {
    expect(checkLinkedInFile({ name: "resume.pdf", size: 9000 }, "chats").ok).toBe(false);
    expect(checkLinkedInFile({ name: "export.zip", size: 0 }, "connections").ok).toBe(false);
  });
});

describe("fileSize", () => {
  it("reads as KB or MB", () => {
    expect(fileSize(830_000)).toBe("830 KB");
    expect(fileSize(2_400_000)).toBe("2.4 MB");
    expect(fileSize(10)).toBe("1 KB");
  });
});
