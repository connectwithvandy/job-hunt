// Read-only: how AI scores spread for jobs found in a window, to compare before and after a scoring change.
// npx convex run --prod scoreSpread:run '{"fromDaysAgo":7,"toDaysAgo":0}'
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const run = internalAction({
  args: { fromDaysAgo: v.number(), toDaysAgo: v.number() },
  handler: async (ctx, { fromDaysAgo, toDaysAgo }) => {
    const now = Date.now();
    const from = now - fromDaysAgo * 86_400_000;
    const to = now - toDaysAgo * 86_400_000;
    const scores: number[] = [];
    let cursor: string | null = null;
    // A page at a time, newest first, stopping once past the window's start (at most 200 pages).
    for (let i = 0; i < 200; i++) {
      const page: { scores: number[]; cursor: string; done: boolean } = await ctx.runQuery(internal.jobs.scorePage, { from, to, cursor });
      scores.push(...page.scores);
      if (page.done) break;
      cursor = page.cursor;
    }
    if (!scores.length) return { jobs: 0 };
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
    const counts = new Map<number, number>();
    for (const s of scores) counts.set(s, (counts.get(s) ?? 0) + 1);
    const [common, commonN] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const share = (lo: number, hi: number) => `${Math.round((100 * scores.filter((s) => s >= lo && s < hi).length) / scores.length)}%`;
    return {
      jobs: scores.length,
      mean: Math.round(mean),
      spread: Math.round(sd * 10) / 10,
      mostCommon: `${common} (${Math.round((100 * commonN) / scores.length)}% of jobs)`,
      bands: { "80+": share(80, 101), "70-79": share(70, 80), "60-69": share(60, 70), "40-59": share(40, 60), "under 40": share(0, 40) },
    };
  },
});
