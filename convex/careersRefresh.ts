"use node";

import { internal } from "./_generated/api";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { CAREER_BOARDS, type CareerBoard } from "./lib/careerBoards";
import { readBoard, type CareerJob } from "./lib/careers";
import { openTo, readPlace, titleMatches } from "./lib/sources";

const INDIA = readPlace("India");

// Boards per run. The rest go to a follow-up run, so a long list never hits the 10-minute action limit.
const CHUNK = 40;

/** Downloads every careers board once and keeps the shared table in step: new roles in, closed roles out. */
export const refresh = internalAction({
  args: { start: v.optional(v.number()) },
  handler: async (ctx, { start = 0 }) => {
    const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
    // No tracks yet would mean keeping nothing; leave the table as it is.
    if (!titles.length) return null;
    let added = 0;
    let removed = 0;
    const one = async (board: CareerBoard) => {
      const have = new Set<string>(await ctx.runQuery(internal.careers.idsFor, { company: board.name }));
      const read = await readBoard(board, titles, have);
      // Workday roles already saved come back as ids only; they're still open.
      const stillOpen = read.filter((j) => "known" in j).map((j) => j.externalId);
      // Only roles in India or remote, with a title someone's tracks ask for; the rest drop out on the next run.
      const jobs = read
        .filter((j): j is CareerJob => !("known" in j))
        .map((j) => ({ ...j, india: openTo(INDIA, j.location, j.workSetting, j.title) }))
        .filter((j) => j.india || j.workSetting === "remote" || /remote|distributed/i.test(j.location))
        .filter((j) => titles.some((t) => titleMatches(t, j.title)));
      const live = new Set([...jobs.map((j) => j.externalId), ...stillOpen]);
      const fresh = jobs.filter((j) => !have.has(j.externalId));
      const gone = [...have].filter((id) => !live.has(id));
      for (let i = 0; i < fresh.length; i += 50) await ctx.runMutation(internal.careers.addJobs, { jobs: fresh.slice(i, i + 50) });
      for (let i = 0; i < gone.length; i += 200) await ctx.runMutation(internal.careers.removeJobs, { externalIds: gone.slice(i, i + 200) });
      added += fresh.length;
      removed += gone.length;
    };
    const found: CareerBoard[] = await ctx.runQuery(internal.careers.discovered, {});
    const boards = [...CAREER_BOARDS, ...found];
    const mine = boards.slice(start, start + CHUNK);
    // A few boards at a time: some send over 10 MB. A board that fails keeps yesterday's roles.
    for (let i = 0; i < mine.length; i += 4) {
      const batch = mine.slice(i, i + 4);
      const settled = await Promise.allSettled(batch.map(one));
      settled.forEach((r, k) => r.status === "rejected" && console.warn("Careers board failed:", batch[k].name, String(r.reason)));
    }
    console.log(`Careers boards ${start + 1}-${start + mine.length} of ${boards.length}: ${added} new roles, ${removed} closed.`);
    if (start + CHUNK < boards.length) await ctx.scheduler.runAfter(0, internal.careersRefresh.refresh, { start: start + CHUNK });
    return null;
  },
});
