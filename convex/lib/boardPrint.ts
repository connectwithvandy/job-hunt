// A fast board's fingerprint from its light job list, so the half-hourly check can tell whether anything changed
// without reading the board in full. Plain fetch only: this runs in the default runtime, 8x cheaper than Node (25 Nov 2026).
import type { CareerBoard } from "./careerBoards";

export const FAST_ATS = new Set<CareerBoard["ats"]>(["ashby", "greenhouse", "lever"]);

export const boardKey = (board: CareerBoard) => `${board.ats}:${board.slug}`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

/** The same ids in any order give the same fingerprint. */
export async function fingerprintOf(ids: string[]) {
  const bytes = new TextEncoder().encode([...ids].sort().join(","));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The job ids in a board's list, read piece by piece so the whole list is never held in memory: Lever and Ashby
 * lists carry every description (Veeva 12 MB, Paytm 14 MB), too big for the default runtime's 64 MB.
 * Inside JSON strings quotes are escaped, so `"id":"…"` only matches real id fields. Ashby's unlisted jobs count too:
 * they only change the fingerprint when they change.
 */
async function streamIds(url: string): Promise<string[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok || !res.body) throw new Error(`${new URL(url).host} answered ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const ids: string[] = [];
  const pattern = /"id"\s*:\s*"([^"\\]{1,100})"/g;
  let tail = "";
  for (;;) {
    const { value, done } = await reader.read();
    const text = tail + (value ? decoder.decode(value, { stream: !done }) : "");
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      ids.push(m[1]);
      last = (m.index ?? 0) + m[0].length;
    }
    // Keep the unmatched end, in case an id field is split across two pieces.
    tail = text.slice(Math.max(last, text.length - 200));
    if (done) break;
  }
  return ids;
}

/** A fast board's fingerprint, from its job list's ids. */
export async function boardFingerprint(board: CareerBoard) {
  if (board.ats === "greenhouse") return await fingerprintOf((await getJson<{ jobs: { id: number }[] }>(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs`)).jobs.map((j) => String(j.id)));
  if (board.ats === "ashby") return await fingerprintOf(await streamIds(`https://api.ashbyhq.com/posting-api/job-board/${board.slug}`));
  return await fingerprintOf(await streamIds(`https://api.lever.co/v0/postings/${board.slug}?mode=json`));
}
