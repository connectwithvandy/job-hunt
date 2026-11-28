// The careers-board read, run from GitHub Actions since 28 Nov 2026 (scripts/careers-runner.ts,
// .github/workflows/careers-boards.yml). Reading boards is mostly waiting on slow pages, and Convex bills Node
// actions 512 MB for every second of it: careersRefresh.refresh was most of the monthly bill. GitHub's runners are
// free for a public repo, so the script reads the boards there and only sends what changed. These functions are
// what it calls. They are public (a script can't call internal ones) and each one checks CAREERS_RUNNER_SECRET,
// which is set both here and as a GitHub secret. Default runtime: they only read and write the database.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env } from "./_generated/server";
import type { CareerBoard } from "./lib/careerBoards";
import { pickedBoards } from "./lib/pickedBoards";
import { boardV, careerJobV } from "./careers";

function check(secret: string) {
  const want = env.CAREERS_RUNNER_SECRET;
  if (!want || secret !== want) throw new Error("Not allowed");
}

/** What to read: the titles members track, and every board (hand-picked, with moves applied, then the found ones). */
export const plan = action({
  args: { secret: v.string() },
  handler: async (ctx, { secret }): Promise<{ titles: string[]; picked: CareerBoard[]; found: CareerBoard[]; off: boolean }> => {
    check(secret);
    const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
    const picked = await pickedBoards(ctx);
    const found: CareerBoard[] = await ctx.runQuery(internal.careers.discovered, {});
    return { titles, picked, found, off: env.SCHEDULED_OFF === "1" };
  },
});

/** The roles already saved for one company, so the script can tell new from closed. */
export const saved = action({
  args: { secret: v.string(), company: v.string() },
  handler: async (ctx, { secret, company }): Promise<{ externalId: string; url: string }[]> => {
    check(secret);
    const rows: { externalId: string; url: string }[] = await ctx.runQuery(internal.careers.linksFor, { company });
    return rows.map(({ externalId, url }) => ({ externalId, url }));
  },
});

/** One batch of changes from a board read: up to 50 roles in and 200 out per call. */
export const apply = action({
  args: { secret: v.string(), add: v.array(careerJobV), remove: v.array(v.string()) },
  handler: async (ctx, { secret, add, remove }) => {
    check(secret);
    if (add.length) await ctx.runMutation(internal.careers.addJobs, { jobs: add });
    if (remove.length) await ctx.runMutation(internal.careers.removeJobs, { externalIds: remove });
    return null;
  },
});

/**
 * After every board is read: the same follow-ups careersRefresh.refresh ran after its last chunk. Marks the boards
 * read, logs hand-picked pages that failed or listed nothing, looks for pages that moved, sends new roles to the
 * people they fit, and (morning read only) sweeps out roles no board lists any more.
 */
export const finish = action({
  args: {
    secret: v.string(),
    fresh: v.boolean(),
    since: v.number(),
    read: v.array(v.string()),
    failed: v.array(v.string()),
    empty: v.array(v.string()),
    broken: v.array(v.string()),
    /** Boards GitHub couldn't read because the site refused its runners (Workable): Convex reads these itself. */
    handOff: v.optional(v.array(boardV)),
  },
  handler: async (ctx, { secret, fresh, since, read, failed, empty, broken, handOff = [] }) => {
    check(secret);
    if (handOff.length) {
      const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
      await ctx.scheduler.runAfter(0, internal.careersRefresh.syncChanged, { boards: handOff, titles, mark: true });
    }
    for (let i = 0; i < read.length; i += 400) await ctx.runMutation(internal.careers.markRead, { names: read.slice(i, i + 400) });
    if (!fresh && (failed.length || empty.length)) {
      const parts = [failed.length ? `failed: ${failed.join("; ")}` : "", empty.length ? `listed no jobs: ${empty.join(", ")}` : ""].filter(Boolean);
      await ctx.runMutation(internal.errors.logServer, { message: `Hand-picked careers pages not read. ${parts.join(". ")}`, page: "careers boards" });
    }
    const toHeal = [...new Set([...empty, ...broken])];
    if (!fresh && toHeal.length) await ctx.scheduler.runAfter(0, internal.careersRefresh.heal, { names: toHeal });
    await ctx.scheduler.runAfter(0, internal.agent.freshRun, { since });
    if (!fresh) await ctx.scheduler.runAfter(0, internal.careersRefresh.sweep, {});
    return null;
  },
});
