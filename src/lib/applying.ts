import type { Id } from "../../convex/_generated/dataModel";

// Which job the next autofill is for. The Apply button sets it; the bookmark's jobpipe.in/fill window reads it.
const KEY = "jobpipe:applying";
const FRESH = 12 * 60 * 60 * 1000;

export function setApplying(jobId: Id<"jobs">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ jobId, at: Date.now() }));
  } catch {
    // Private windows can refuse storage; the fill window then asks to click Apply again.
  }
}

export function applyingJob(): Id<"jobs"> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { jobId: Id<"jobs">; at: number } | null;
    return saved && Date.now() - saved.at < FRESH ? saved.jobId : null;
  } catch {
    return null;
  }
}
