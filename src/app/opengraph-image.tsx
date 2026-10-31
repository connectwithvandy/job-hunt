import { ImageResponse } from "next/og";

// The picture shown when jobpipe.in is shared on LinkedIn, WhatsApp or X.
export const alt = "JobPipe: you're not looking for a job, you're running several searches at once.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0b0b0f", color: "#f4f4f5", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
          JOBPIPE<span style={{ color: "#c6ff3d" }}>.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
          <div style={{ display: "flex" }}>
            You&apos;re not looking for&nbsp;<span style={{ color: "#c6ff3d" }}>a</span>&nbsp;job.
          </div>
          <div>You&apos;re running several searches at once.</div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa" }}>Jobs scored against your CV · tailored CVs · warm intros · jobpipe.in</div>
      </div>
    ),
    size,
  );
}
