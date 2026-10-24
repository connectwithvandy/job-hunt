"use node";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { CAREER_BOARDS, type CareerBoard } from "./lib/careerBoards";
import { readBoard } from "./lib/careers";
import { openTo, readPlace } from "./lib/sources";

const INDIA = readPlace("India");

/** Downloads every careers board once and keeps the shared table in step: new roles in, closed roles out. */
export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    let added = 0;
    let removed = 0;
    const one = async (board: CareerBoard) => {
      const jobs = (await readBoard(board)).map((j) => ({ ...j, india: openTo(INDIA, j.location, j.workSetting, j.title) }));
      const have = new Set<string>(await ctx.runQuery(internal.careers.idsFor, { company: board.name }));
      const live = new Set(jobs.map((j) => j.externalId));
      const fresh = jobs.filter((j) => !have.has(j.externalId));
      const gone = [...have].filter((id) => !live.has(id));
      for (let i = 0; i < fresh.length; i += 50) await ctx.runMutation(internal.careers.addJobs, { jobs: fresh.slice(i, i + 50) });
      for (let i = 0; i < gone.length; i += 200) await ctx.runMutation(internal.careers.removeJobs, { externalIds: gone.slice(i, i + 200) });
      added += fresh.length;
      removed += gone.length;
    };
    // A few boards at a time: some send over 10 MB. A board that fails keeps yesterday's roles.
    for (let i = 0; i < CAREER_BOARDS.length; i += 4) {
      const batch = CAREER_BOARDS.slice(i, i + 4);
      const settled = await Promise.allSettled(batch.map(one));
      settled.forEach((r, k) => r.status === "rejected" && console.warn("Careers board failed:", batch[k].name, String(r.reason)));
    }
    console.log(`Careers boards: ${added} new roles, ${removed} closed.`);
    return null;
  },
});
