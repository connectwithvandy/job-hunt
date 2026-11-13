"use node";

import { internal } from "./_generated/api";
import { v } from "convex/values";
import { type ActionCtx, env, internalAction } from "./_generated/server";
import { searchJobs } from "./lib/apify";
import { CAREER_BOARDS, type CareerBoard } from "./lib/careerBoards";
import { boardFingerprint, boardKey, FAST_ATS, readBoard, type CareerJob } from "./lib/careers";
import { isCompanyLink } from "./lib/directLink";
import { findBoard } from "./lib/boardFinder";
import { atsV } from "./careers";
import { openTo, readPlace, titleMatches } from "./lib/sources";

const INDIA = readPlace("India");

// One LinkedIn search per kind of role, shared by everyone: searching per person would cost about 20 times more.
const LINKEDIN_SEARCHES = [
  `"Sales Development Representative" OR "SDR" OR "Business Development Representative" OR "BDR" OR "Inside Sales"`,
  `"Account Executive" OR "Sales Executive" OR "Business Development Executive"`,
  `"Sales Manager" OR "Sales Development Manager" OR "Business Development Manager" OR "Head of Sales"`,
  `"Account Manager" OR "Customer Success Manager" OR "Partnerships Manager"`,
  `"Solutions Engineer" OR "Sales Engineer" OR "Revenue Operations" OR "GTM"`,
];
const KEEP_LINKEDIN_DAYS = 30;

/**
 * Before the morning run: today's LinkedIn sales roles in India, saved beside the careers-board roles so everyone's
 * search finds them. About $0.25 a day, capped at $0.30. Only roles with the company's own apply link are kept,
 * because every saved job has to open the company's posting (lib/directLink.ts).
 */
export const linkedInPool = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!env.APIFY_TOKEN) return null;
    const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
    if (!titles.length) return null;
    const settled = await Promise.allSettled(LINKEDIN_SEARCHES.map((q) => searchJobs([q], "India", false, "24h", 50, 0.06, true)));
    settled.forEach((r, i) => r.status === "rejected" && console.warn("LinkedIn pool search failed:", i, String(r.reason)));
    const found = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const jobs = [...new Map(found.map((j) => [j.id, j])).values()]
      .filter((j) => isCompanyLink(j.applyUrl) && titles.some((t) => titleMatches(t, j.title)))
      .map((j) => ({
        externalId: `linkedin:${j.id}`,
        company: j.company,
        title: j.title,
        location: j.location,
        workSetting: j.workSetting,
        salary: j.salary,
        postedAt: j.postedAt,
        url: j.applyUrl!,
        india: openTo(INDIA, j.location, j.workSetting, j.title),
        description: j.description?.slice(0, 8000).replace(/[\uD800-\uDBFF]$/, ""),
      }))
      .filter((j) => j.india);
    for (let i = 0; i < jobs.length; i += 50) await ctx.runMutation(internal.careers.addJobs, { jobs: jobs.slice(i, i + 50) });
    const old: string[] = await ctx.runQuery(internal.careers.oldLinkedIn, { before: Date.now() - KEEP_LINKEDIN_DAYS * 86_400_000 });
    for (let i = 0; i < old.length; i += 200) await ctx.runMutation(internal.careers.removeJobs, { externalIds: old.slice(i, i + 200) });
    console.log(`LinkedIn pool: ${found.length} found, ${jobs.length} saved, ${old.length} old ones removed.`);
    return null;
  },
});

/** Reads one board and keeps the shared table in step: new roles in, closed roles out. */
async function syncBoard(ctx: ActionCtx, board: CareerBoard, titles: string[]) {
  const saved: { externalId: string; url: string }[] = await ctx.runQuery(internal.careers.linksFor, { company: board.name });
  const have = new Set(saved.map((s) => s.externalId));
  const linkOf = new Map(saved.map((s) => [s.externalId, s.url]));
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
  // New roles, plus saved ones whose link the board moved (addJobs updates those links).
  const fresh = jobs.filter((j) => !have.has(j.externalId) || linkOf.get(j.externalId) !== j.url);
  const gone = [...have].filter((id) => !live.has(id));
  for (let i = 0; i < fresh.length; i += 50) await ctx.runMutation(internal.careers.addJobs, { jobs: fresh.slice(i, i + 50) });
  for (let i = 0; i < gone.length; i += 200) await ctx.runMutation(internal.careers.removeJobs, { externalIds: gone.slice(i, i + 200) });
  return { added: fresh.length, removed: gone.length };
}

// Boards per run. The rest go to a follow-up run, so a long list never hits the 10-minute action limit.
const CHUNK = 40;

/** Downloads every careers board once and keeps the shared table in step: new roles in, closed roles out. */
export const refresh = internalAction({
  args: { start: v.optional(v.number()), fresh: v.optional(v.boolean()), since: v.optional(v.number()) },
  handler: async (ctx, { start = 0, fresh, since = Date.now() }) => {
    const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
    // No tracks yet would mean keeping nothing; leave the table as it is.
    if (!titles.length) return null;
    let added = 0;
    let removed = 0;
    const one = async (board: CareerBoard) => {
      const done = await syncBoard(ctx, board, titles);
      added += done.added;
      removed += done.removed;
    };
    const found: CareerBoard[] = await ctx.runQuery(internal.careers.discovered, {});
    // Hourly reads leave the fast boards to quickCheck; the 7:00 read still covers everything.
    const boards = [...CAREER_BOARDS, ...found].filter((b) => !fresh || !FAST_ATS.has(b.ats));
    const mine = boards.slice(start, start + CHUNK);
    // A few boards at a time: some send over 10 MB. A board that fails keeps yesterday's roles.
    for (let i = 0; i < mine.length; i += 4) {
      const batch = mine.slice(i, i + 4);
      const settled = await Promise.allSettled(batch.map(one));
      settled.forEach((r, k) => r.status === "rejected" && console.warn("Careers board failed:", batch[k].name, String(r.reason)));
    }
    console.log(`Careers boards ${start + 1}-${start + mine.length} of ${boards.length}: ${added} new roles, ${removed} closed.`);
    if (start + CHUNK < boards.length) await ctx.scheduler.runAfter(0, internal.careersRefresh.refresh, { start: start + CHUNK, fresh, since });
    // Daytime reads: what's new goes straight to the people it fits (agent.freshRun).
    else if (fresh) await ctx.scheduler.runAfter(0, internal.agent.freshRun, { since });
    return null;
  },
});

/**
 * Every 15 minutes: fetches each fast board's light job list and compares it with last time. Only a board that
 * changed is read in full, so most runs touch almost nothing in the database. New roles go straight to agent.freshRun.
 */
export const quickCheck = internalAction({
  args: {},
  handler: async (ctx) => {
    const since = Date.now();
    const saved: { key: string; hash: string }[] = await ctx.runQuery(internal.careers.boardHashes, {});
    const last = new Map(saved.map((s) => [s.key, s.hash]));
    const found: CareerBoard[] = await ctx.runQuery(internal.careers.discovered, {});
    const boards = [...CAREER_BOARDS, ...found].filter((b) => FAST_ATS.has(b.ats));
    const changed: { board: CareerBoard; key: string; hash: string; isNew: boolean }[] = [];
    let failed = 0;
    for (let i = 0; i < boards.length; i += 10) {
      await Promise.all(
        boards.slice(i, i + 10).map(async (board) => {
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
    let added = 0;
    if (changed.some((c) => !c.isNew)) {
      const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
      for (const c of changed.filter((x) => !x.isNew)) {
        try {
          added += (await syncBoard(ctx, c.board, titles)).added;
        } catch (err) {
          console.warn("Careers board failed:", c.board.name, String(err));
          // Keeps the old fingerprint, so the next check tries this board again.
          c.hash = "";
        }
      }
    }
    const rows = changed.filter((c) => c.hash).map(({ key, hash }) => ({ key, hash }));
    if (rows.length) await ctx.runMutation(internal.careers.saveBoardHashes, { rows });
    if (added) await ctx.scheduler.runAfter(0, internal.agent.freshRun, { since });
    console.log(`Quick check: ${boards.length} boards, ${changed.length} changed, ${added} new roles, ${failed} failed.`);
    return null;
  },
});

/**
 * For the owner: read one board by hand, or find one from a company's name and website, to check before adding it.
 * npx convex run careersRefresh:tryBoard '{"ats":"workable","slug":"huggingface"}'
 * npx convex run careersRefresh:tryBoard '{"name":"Hugging Face","website":"huggingface.co"}'
 */
export const tryBoard = internalAction({
  args: { ats: v.optional(atsV), slug: v.optional(v.string()), name: v.optional(v.string()), website: v.optional(v.string()) },
  returns: v.string(),
  handler: async (_ctx, { ats, slug, name, website }) => {
    const found = ats && slug ? { ats, slug } : await findBoard({ name: name ?? "", website: website ?? "" });
    if (!found) return "No board found.";
    const jobs = (await readBoard({ ...found, name: name ?? found.slug, website: website ?? "" })).filter((j): j is CareerJob => !("known" in j));
    const sample = jobs.slice(0, 3).map((j) => `- ${j.title} · ${j.location} · ${j.workSetting ?? "-"} · ${j.postedAt ?? "no date"} · ${j.description ? `${j.description.length} chars` : "no description"}\n  ${j.url}`);
    return `${found.ats}:${found.slug}: ${jobs.length} roles\n${sample.join("\n")}`;
  },
});
