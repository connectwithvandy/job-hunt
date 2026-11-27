import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The logo's own face (Space Grotesk Bold, Open Font License), bundled so images match the site.
const font = () => readFile(join(process.cwd(), "src/app/fonts/SpaceGrotesk-Bold.ttf"));

// The picture shown when jobpipe.in is shared on LinkedIn, WhatsApp or X.
// LinkedIn often shows it as a small square cut from the middle, so the words sit in the centre third.
export const alt = "JobPipe: finds the roles, tailors your CV, gets you the intro.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const data = await font();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0b0b0f", color: "#f4f4f5", fontFamily: "Space Grotesk", textAlign: "center" }}>
        {/* The wordmark (logo C, 27 Nov 2026): "Job" in white, "Pipe" in lime on a faint lime wash. */}
        <div style={{ display: "flex", fontSize: 120, fontWeight: 700, letterSpacing: -2 }}>
          <span>Job</span>
          <span style={{ color: "#c6ff3d", background: "rgba(198,255,61,0.18)", borderRadius: 10, padding: "0 10px" }}>Pipe</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24, fontSize: 48, fontWeight: 700, lineHeight: 1.15 }}>
          <div>Finds the roles.</div>
          <div>Tailors your CV.</div>
          <div style={{ color: "#c6ff3d" }}>Gets you the intro.</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Space Grotesk", data, weight: 700, style: "normal" }] },
  );
}
