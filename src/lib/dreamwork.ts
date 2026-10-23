import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Dreamwork (dreamworkhq.com) indexes jobs from company career pages. Its public
// MCP server lets anyone search and read listings without an account.
const DREAMWORK_MCP = "https://mcp.dreamworkhq.com/mcp";

export type Listing = {
  id: string;
  title: string;
  company: string;
  location: string;
  workSetting?: string;
  salary?: string | null;
  postedAt?: string | null;
  firstSeenAt?: string;
  url: string;
  sourceUrl?: string;
};

export type ListingDetail = {
  description: string;
  companyLogoUrl?: string;
  seniorityLevel?: string;
  sourceUrl?: string;
};

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = new Client({ name: "job-hunt", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(DREAMWORK_MCP)));
  try {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      const text = (result.content as { text?: string }[])?.[0]?.text ?? "unknown error";
      throw new Error(`Dreamwork ${name} failed: ${text}`);
    }
    return (result.structuredContent ??
      JSON.parse((result.content as { text: string }[])[0].text)) as T;
  } finally {
    await client.close();
  }
}

export async function searchListings(search: string, location: string, limit = 10) {
  const page = await callTool<{ listings: Listing[] }>("browse_listings", {
    search,
    location,
    postedWithinDays: 30,
    limit,
  });
  return page.listings;
}

/** Every open role at one company, anywhere. Title search within a company returns nothing, so scoring does the filtering. */
export async function companyListings(company: string) {
  const page = await callTool<{ listings: Listing[] }>("browse_listings", { company, limit: 50 });
  return page.listings;
}

export async function getListing(id: string) {
  const body = await callTool<{ listing: ListingDetail }>("get_listing", { id });
  return body.listing;
}

export function dreamworkIdFromUrl(url: string) {
  return url.match(/dreamworkhq\.com\/job\/([0-9a-f-]{36})/)?.[1] ?? null;
}
