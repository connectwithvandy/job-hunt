import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The logo's own face (Space Grotesk Bold, Open Font License), bundled so images match the site.
const font = () => readFile(join(process.cwd(), "src/app/fonts/SpaceGrotesk-Bold.ttf"));

// The home-screen icon on iPhones (logo C, 27 Nov 2026): a lime rounded square with an ink "J".
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const data = await font();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#c6ff3d", borderRadius: 40, color: "#0b0b0f", fontSize: 132, fontWeight: 700, paddingLeft: 6, fontFamily: "Space Grotesk" }}>
        J
      </div>
    ),
    { ...size, fonts: [{ name: "Space Grotesk", data, weight: 700, style: "normal" }] },
  );
}
