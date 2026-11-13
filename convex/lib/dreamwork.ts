"use node";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ConvexError } from "convex/values";

// Dreamwork (dreamworkhq.com) indexes jobs from company career pages. Its public
// MCP server lets anyone search and read listings without an account.
const DREAMWORK_MCP = "https://mcp.dreamworkhq.com/mcp";

export type Listing = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  workSetting?: string | null;
  salary?: string | null;
  postedAt?: string | null;
  firstSeenAt?: string;
  url: string;
  sourceUrl?: string;
};

export type ListingDetail = {
  description: string | null;
  companyLogoUrl?: string | null;
  seniorityLevel?: string | null;
  sourceUrl?: string | null;
};

async function connect() {
  const client = new Client({ name: "job-hunt", version: "0.1.0" });
  // A slow Dreamwork request should fail fast, not leave the button spinning forever.
  await client.connect(new StreamableHTTPClientTransport(new URL(DREAMWORK_MCP)), { timeout: 15_000 });
  return client;
}

async function ask<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 25_000 });
  if (result.isError) {
    const text = (result.content as { text?: string }[])?.[0]?.text ?? "unknown error";
    // Dreamwork explains refusals in plain words, like an unknown place; pass that on.
    let reason = text;
    try {
      reason = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {}
    throw new ConvexError(reason);
  }
  return (result.structuredContent ?? JSON.parse((result.content as { text: string }[])[0].text)) as T;
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = await connect();
  try {
    return await ask<T>(client, name, args);
  } finally {
    await client.close();
  }
}

/**
 * Tries again after a passing failure (a time-out, a dropped connection, a busy server), waiting longer each
 * time, with a little randomness so many searches failing together don't all come back at once.
 * Dreamwork's own refusals (a ConvexError, like an unknown place) won't change on a retry.
 */
async function withRetry<T>(run: () => Promise<T>, waits = RETRY_WAITS): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (err) {
      if (err instanceof ConvexError || i >= waits.length) throw err;
      await new Promise((done) => setTimeout(done, waits[i] + Math.random() * 1000));
    }
  }
}
const RETRY_WAITS = [2000, 5000];

/** Without a key Dreamwork sends 25 at a time, so a busy title like "Account Executive" needs a few pages. */
export async function searchListings(search: string, location: string, limit = 10, pages = 1) {
  const where = location.trim().toLowerCase();
  const filters = {
    search,
    ...(where === "remote" ? { remote: true } : where === "anywhere" || !where ? {} : { location: location.trim() }),
    postedWithinDays: 30,
    limit,
  };
  const all: Listing[] = [];
  let cursor: string | undefined;
  // One connection for all the pages of a search: opening one per page doubled the calls on a busy morning.
  let client: Client | null = null;
  try {
    for (let i = 0; i < pages; i++) {
      const args = cursor ? { ...filters, cursor } : filters;
      type Page = { listings: Listing[]; nextCursor?: string | null };
      let page: Page;
      try {
        page = await withRetry(async () => {
          try {
            client ??= await connect();
            return await ask<Page>(client, "browse_listings", args);
          } catch (err) {
            // A broken connection is dropped, so the next try starts a fresh one.
            if (!(err instanceof ConvexError) && client) {
              await client.close().catch(() => {});
              client = null;
            }
            throw err;
          }
        });
      } catch (err) {
        // A later page failing shouldn't lose the pages already read.
        if (!all.length) throw err;
        console.warn("Dreamwork stopped early", search, String(err));
        break;
      }
      all.push(...page.listings);
      cursor = page.nextCursor ?? undefined;
      if (!cursor) break;
    }
  } finally {
    await (client as Client | null)?.close().catch(() => {});
  }
  return all;
}

/**
 * Open roles at one company: those in India, remote ones, and the newest anywhere. A search returns at most 25,
 * so a big company's Indian roles only show up when asked for directly. Title search within a company returns
 * nothing, so callers do the filtering.
 */
export async function companyListings(company: string) {
  const pages = await Promise.allSettled([
    callTool<{ listings: Listing[] }>("browse_listings", { company, location: "India", limit: 25 }),
    callTool<{ listings: Listing[] }>("browse_listings", { company, remote: true, limit: 25 }),
    callTool<{ listings: Listing[] }>("browse_listings", { company, limit: 25 }),
  ]);
  if (pages.every((p) => p.status === "rejected")) throw (pages[0] as PromiseRejectedResult).reason;
  const all = pages.flatMap((p) => (p.status === "fulfilled" ? p.value.listings : []));
  return [...new Map(all.map((l) => [l.id, l])).values()];
}

export async function getListing(id: string) {
  const body = await callTool<{ listing: ListingDetail }>("get_listing", { id });
  return body.listing;
}

/** True when Dreamwork no longer has this job, as opposed to a passing failure. */
export const listingGone = (err: unknown) => /listing not found/i.test(err instanceof ConvexError ? String(err.data) : String(err));

export function dreamworkIdFromUrl(url: string) {
  return url.match(/dreamworkhq\.com\/job\/([0-9a-f-]{36})/)?.[1] ?? null;
}
