// Reads public LinkedIn posts through Apify's ready-made tools ("actors"). Each run has a hard cost cap,
// and only the owner's account uses it for now: LinkedIn's rules forbid automated reading, so it stays small.

import { ConvexError } from "convex/values";
import { env } from "../_generated/server";

/** Runs an Apify actor and waits for its results. `maxUsd` stops it charging past that. */
async function run<T>(actor: string, input: Record<string, unknown>, maxUsd: number): Promise<T[]> {
  if (!env.APIFY_TOKEN) throw new ConvexError("LinkedIn reading isn't switched on: add an Apify token first.");
  const params = new URLSearchParams({ timeout: "150", maxTotalChargeUsd: String(maxUsd) });
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?${params}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.APIFY_TOKEN}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(170_000),
  }).catch(() => null);
  if (!res) throw new ConvexError("Apify didn't answer. Try again in a minute.");
  if (!res.ok) throw new ConvexError(`Apify answered ${res.status}. Check the token and the account's credit.`);
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items as T[]) : [];
}

export type Post = { id: string; text: string; url: string; at?: number; author: { name: string; headline: string; url: string } };

type RawPost = {
  type?: string;
  id?: string;
  linkedinUrl?: string;
  content?: string;
  author?: { name?: string; info?: string; linkedinUrl?: string; publicIdentifier?: string };
  postedAt?: { timestamp?: number };
};

function toPost(p: RawPost): Post | null {
  if (!p.id || !p.content?.trim()) return null;
  const handle = p.author?.publicIdentifier;
  return {
    id: p.id,
    text: p.content.trim(),
    url: p.linkedinUrl ?? "",
    at: p.postedAt?.timestamp,
    author: {
      name: p.author?.name ?? "",
      headline: p.author?.info ?? "",
      // Their plain profile link, without LinkedIn's tracking bits.
      url: handle ? `https://www.linkedin.com/in/${handle}/` : (p.author?.linkedinUrl?.split("?")[0] ?? ""),
    },
  };
}

/** A person's latest posts, newest first. About $0.01 for five. */
export async function recentPosts(profileUrl: string, max = 5) {
  const rows = await run<RawPost>("harvestapi~linkedin-profile-posts", { targetUrls: [profileUrl], maxPosts: max, includeReposts: false }, 0.05);
  return rows.map(toPost).filter((p): p is Post => !!p).slice(0, max);
}

/** Posts from the last week matching each search, like "hiring sales manager bengaluru". About $0.02 per ten. */
export async function searchPosts(queries: string[], perQuery = 10) {
  const rows = await run<RawPost>("harvestapi~linkedin-post-search", { searchQueries: queries, maxPosts: perQuery, postedLimit: "week", sortBy: "date", profileScraperMode: "short" }, 0.25);
  const seen = new Set<string>();
  return rows.map(toPost).filter((p): p is Post => !!p && !seen.has(p.id) && !!seen.add(p.id));
}
