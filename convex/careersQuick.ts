// The half-hourly check of fast careers boards, in the default runtime: 8x cheaper than Node for the time spent
// waiting on boards (25 Nov 2026: it was 20% of all compute as a Node action). Only boards that changed are read
// in full, by careersRefresh.syncChanged in Node.
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import type { CareerBoard } from "./lib/careerBoards";
import { boardFingerprint, boardKey, FAST_ATS } from "./lib/boardPrint";
import { pickedBoards } from "./lib/pickedBoards";
import { AGGREGATORS } from "./lib/company";
import { v } from "convex/values";

/** A board seen for the first time is read now too, a few a run; past the cap it keeps no fingerprint for next time. */
const NEW_PER_RUN = 15;
/** Boards fingerprinted at once. Lever and Ashby lists include descriptions, so this stays small for 64 MB. */
const AT_ONCE = 8;
/** Changed boards read in full per run (in Node); the rest keep no new fingerprint and come up next run. */
const READ_PER_RUN = 40;

export const quickCheck = internalAction({
  args: { force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { force }) => {
    if (env.SCHEDULED_OFF === "1" && !force) return null;
    const since = Date.now();
    const saved: { key: string; hash: string }[] = await ctx.runQuery(internal.careers.boardHashes, {});
    const last = new Map(saved.map((s) => [s.key, s.hash]));
    const found: CareerBoard[] = await ctx.runQuery(internal.careers.discovered, {});
    // Job resellers' boards are skipped: their roles are dropped anyway, and Jobgether's list alone is 50 MB.
    const boards = [...(await pickedBoards(ctx)), ...found].filter((b) => FAST_ATS.has(b.ats) && !AGGREGATORS.test(b.name));
    const changed: { board: CareerBoard; key: string; hash: string; isNew: boolean }[] = [];
    let failed = 0;
    for (let i = 0; i < boards.length; i += AT_ONCE) {
      await Promise.all(
        boards.slice(i, i + AT_ONCE).map(async (board) => {
          try {
            const key = boardKey(board);
            const hash = await boardFingerprint(board);
            if (last.get(key) !== hash) changed.push({ board, key, hash, isNew: !last.has(key) });
          } catch {
            failed++;
          }
        }),
      );
    }
    const fresh = changed.filter((x) => x.isNew);
    for (const c of fresh.slice(NEW_PER_RUN)) c.hash = "";
    const wanted = [...changed.filter((x) => !x.isNew), ...fresh.slice(0, NEW_PER_RUN)];
    for (const c of wanted.slice(READ_PER_RUN)) c.hash = "";
    const toRead = wanted.slice(0, READ_PER_RUN);
    let added = 0;
    if (toRead.length) {
      const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
      const result: { added: number; failed: string[] } = await ctx.runAction(internal.careersRefresh.syncChanged, {
        boards: toRead.map(({ board }) => ({ name: board.name, website: board.website, ats: board.ats, slug: board.slug, ...(board.careersUrl && { careersUrl: board.careersUrl }) })),
        titles,
      });
      added = result.added;
      // A board that failed keeps its old fingerprint, so the next check tries it again.
      const bad = new Set(result.failed);
      for (const c of toRead) if (bad.has(c.key)) c.hash = "";
    }
    const rows = changed.filter((c) => c.hash).map(({ key, hash }) => ({ key, hash }));
    if (rows.length) await ctx.runMutation(internal.careers.saveBoardHashes, { rows });
    if (added) await ctx.scheduler.runAfter(0, internal.agent.freshRun, { since });
    console.log(`Quick check: ${boards.length} boards, ${changed.length} changed, ${added} new roles, ${failed} failed.`);
    return null;
  },
});
