// The COSTS block of the owner's morning email: what running JobPipe cost yesterday and this month.
// AI comes from Anthropic's own cost report (needs ANTHROPIC_ADMIN_KEY), Apify from its usage page.

export type Spend = { yesterday: number | null; month: number } | { error: string } | null;

/** Anthropic's daily cost report rows: `amount` is a decimal string in cents. */
export type CostBucket = { starting_at: string; results: { amount: string; workspace_id?: string | null }[] };

/** Sums Anthropic cost buckets into dollars for yesterday (UTC) and the month so far, for one workspace or all. */
export function sumAnthropic(buckets: CostBucket[], yesterdayStart: string, workspaceId?: string): { yesterday: number; month: number } {
  let yesterday = 0;
  let month = 0;
  for (const b of buckets) {
    for (const r of b.results) {
      if (workspaceId && r.workspace_id !== workspaceId) continue;
      const dollars = Number(r.amount) / 100;
      if (!Number.isFinite(dollars)) continue;
      month += dollars;
      if (b.starting_at.slice(0, 10) === yesterdayStart.slice(0, 10)) yesterday += dollars;
    }
  }
  return { yesterday, month };
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Two lines a service, then totals in dollars and rupees. Plan fees are left out: they don't change day to day. */
export function costsSection({ ai, apify, inrPerUsd }: { ai: Spend; apify: Spend; inrPerUsd: number }) {
  const line = (name: string, s: Spend, missing: string) =>
    !s ? `- ${name}: ${missing}` : "error" in s ? `- ${name}: couldn't read (${s.error})` : `- ${name}: ${s.yesterday === null ? "yesterday not shown" : `${usd(s.yesterday)} yesterday`}, ${usd(s.month)} this month`;
  const known = [ai, apify].filter((s): s is { yesterday: number | null; month: number } => !!s && !("error" in s));
  const yesterday = known.reduce((n, s) => n + (s.yesterday ?? 0), 0);
  const month = known.reduce((n, s) => n + s.month, 0);
  const inr = (n: number) => `₹${Math.round(n * inrPerUsd).toLocaleString("en-IN")}`;
  return [
    "COSTS",
    line("AI (Anthropic)", ai, "add ANTHROPIC_ADMIN_KEY to see it"),
    line("Apify (LinkedIn + Google Jobs)", apify, "not set up"),
    `- Total: ${usd(yesterday)} yesterday (${inr(yesterday)}), ${usd(month)} this month (${inr(month)})`,
    `  Usage only, at ₹${inrPerUsd} a dollar. Fixed plans (Convex, Apify's monthly fee, Google Workspace, domain) aren't included.`,
  ].join("\n");
}
