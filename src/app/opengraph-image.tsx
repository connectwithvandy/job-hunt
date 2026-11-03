import { ImageResponse } from "next/og";

// The picture shown when jobpipe.in is shared on LinkedIn, WhatsApp or X.
// LinkedIn often shows it as a small square cut from the middle, so the words sit in the centre third.
export const alt = "JobPipe: the job search tool for sales and GTM people.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0b0b0f", color: "#f4f4f5", fontFamily: "sans-serif", textAlign: "center" }}>
        <div style={{ display: "flex", fontSize: 120, fontWeight: 800, letterSpacing: 2 }}>
          JobPipe<span style={{ color: "#c6ff3d" }}>.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24, fontSize: 48, fontWeight: 700, lineHeight: 1.15 }}>
          <div>Your sales</div>
          <div>job search,</div>
          <div style={{ color: "#c6ff3d" }}>sorted.</div>
        </div>
      </div>
    ),
    size,
  );
}
