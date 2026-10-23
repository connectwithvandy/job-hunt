import Papa from "papaparse";

export type ConnectionRow = {
  linkedinUrl: string;
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  connectedOn: string;
};

/**
 * Parse LinkedIn's Connections.csv (Settings > Data privacy > Get a copy of your data > Connections).
 * The file starts with a few lines of notes before the real header row.
 */
export function parseConnectionsCsv(text: string): ConnectionRow[] {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.startsWith("First Name,"));
  if (headerAt === -1) {
    throw new Error("This doesn't look like LinkedIn's Connections.csv. Its header should start with \"First Name\".");
  }
  const { data } = Papa.parse<Record<string, string>>(lines.slice(headerAt).join("\n"), { header: true, skipEmptyLines: true });
  return data
    .filter((r) => r["First Name"] || r["Last Name"])
    .map((r) => ({
      linkedinUrl: (r["URL"] ?? "").trim(),
      firstName: (r["First Name"] ?? "").trim(),
      lastName: (r["Last Name"] ?? "").trim(),
      company: (r["Company"] ?? "").trim(),
      position: (r["Position"] ?? "").trim(),
      connectedOn: (r["Connected On"] ?? "").trim(),
    }));
}
