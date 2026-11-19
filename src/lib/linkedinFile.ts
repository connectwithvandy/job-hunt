// Checks the file someone picked before anything is uploaded, so a wrong or missing file gets a plain answer
// on the page instead of an error (19 Nov: a member pressed Load connections with no file, and it landed in
// Admin → Errors while they were left stuck).

export type FileCheck = { ok: true } | { ok: false; message: string };

const LINKEDIN_NAME = "Basic_LinkedInDataExport_….zip";

/** Whether this looks like the file LinkedIn sends: its zip as it is, or the CSV from inside it. */
export function checkLinkedInFile(file: { name: string; size: number } | null | undefined, kind: "connections" | "chats"): FileCheck {
  if (!file) return { ok: false, message: "Choose the file LinkedIn sent you first." };
  const name = file.name.toLowerCase();
  if (!/\.(zip|csv)$/.test(name)) {
    return { ok: false, message: `That's not the LinkedIn file. Look for ${LINKEDIN_NAME} in your Downloads folder.` };
  }
  if (file.size === 0) return { ok: false, message: "That file is empty. Download it again from LinkedIn's email." };
  // A CSV other than the one we read (Profile.csv, Positions.csv…) is the most common mix-up after unzipping.
  const csv = kind === "connections" ? "connections.csv" : "messages.csv";
  if (name.endsWith(".csv") && name !== csv) {
    return {
      ok: false,
      message: `That's ${file.name}. Choose ${kind === "connections" ? "Connections.csv" : "messages.csv"}, or the whole ${LINKEDIN_NAME} as it is.`,
    };
  }
  return { ok: true };
}

/** "2.4 MB", "830 KB": enough to tell the right file from a wrong one at a glance. */
export function fileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
