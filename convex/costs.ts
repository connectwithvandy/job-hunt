"use node";
// Reads what JobPipe spent yesterday and this month, for the COSTS block of the owner's morning email.

import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { costsSection, type CostBucket, type Spend, sumAnthropic } from "./lib/costs";

const DAY = 86_400_000;
const reason = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 120);

/**
 * Anthropic's daily cost report. Needs an Admin API key (ANTHROPIC_ADMIN_KEY), which only reads here.
 * ANTHROPIC_COST_WORKSPACE (a workspace id) counts only JobPipe's workspace; without it, the whole organization.
 */
async function anthropicSpend(now: number): Promise<Spend> {
  if (!env.ANTHROPIC_ADMIN_KEY) return null;
  const today = new Date(now);
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  // On the 1st, "this month" would be empty: show yesterday's month instead.
  const from = monthStart === todayStart ? Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1) : monthStart;
  const yesterdayStart = new Date(todayStart - DAY).toISOString();
  try {
    const buckets: CostBucket[] = [];
    let page: string | undefined;
    for (let i = 0; i < 5; i++) {
      const q = new URLSearchParams({ starting_at: new Date(from).toISOString(), ending_at: new Date(todayStart).toISOString(), limit: "31" });
      q.append("group_by[]", "workspace_id");
      if (page) q.set("page", page);
      const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
        headers: { "x-api-key": env.ANTHROPIC_ADMIN_KEY, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { error: `answered ${res.status}` };
      const body = (await res.json()) as { data?: CostBucket[]; has_more?: boolean; next_page?: string };
      buckets.push(...(body.data ?? []));
      if (!body.has_more || !body.next_page) break;
      page = body.next_page;
    }
    return sumAnthropic(buckets, yesterdayStart, env.ANTHROPIC_COST_WORKSPACE);
  } catch (err) {
    return { error: reason(err) };
  }
}

/** Apify's usage this billing cycle, with a per-day breakdown when it gives one. */
async function apifySpend(now: number): Promise<Spend> {
  if (!env.APIFY_TOKEN) return null;
  try {
    const res = await fetch("https://api.apify.com/v2/users/me/usage/monthly", { headers: { authorization: `Bearer ${env.APIFY_TOKEN}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { error: `answered ${res.status}` };
    const body = (await res.json()) as { data?: { dailyServiceUsages?: { date?: string; totalUsageCreditsUsd?: number }[]; totalUsageCreditsUsdAfterVolumeDiscount?: number } };
    const days = body.data?.dailyServiceUsages ?? [];
    const yesterday = new Date(now - DAY).toISOString().slice(0, 10);
    const row = days.find((d) => (d.date ?? "").slice(0, 10) === yesterday);
    const month = body.data?.totalUsageCreditsUsdAfterVolumeDiscount ?? days.reduce((n, d) => n + (d.totalUsageCreditsUsd ?? 0), 0);
    return { yesterday: days.length ? (row?.totalUsageCreditsUsd ?? 0) : null, month };
  } catch (err) {
    return { error: reason(err) };
  }
}

/** The COSTS block for the morning email. */
export const section = internalAction({
  args: {},
  returns: v.object({ text: v.string() }),
  handler: async () => {
    const now = Date.now();
    const [ai, apify] = await Promise.all([anthropicSpend(now), apifySpend(now)]);
    return { text: costsSection({ ai, apify, inrPerUsd: Number(env.USD_INR ?? 88) }) };
  },
});
