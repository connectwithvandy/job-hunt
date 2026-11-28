// Reads every company careers board and sends only the changes to JobPipe. Runs on GitHub Actions
// (.github/workflows/careers-boards.yml) since 28 Nov 2026, in place of the Convex crons "careers boards" and
// "fresh jobs", which ran careersRefresh.refresh: most of the Convex bill was that action waiting on slow pages.
//
//   CONVEX_URL=https://cautious-sheep-495.convex.cloud CAREERS_RUNNER_SECRET=... npx tsx scripts/careers-runner.ts [--fresh]
//
// --fresh is the 13:00 and 18:00 IST read: only the slower boards (the fast ones are checked every 30 minutes in
// Convex by careersQuick.quickCheck), and no Google or Workday. Without it, every board (the 7:00 read).
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CAREER_BOARDS, type CareerBoard } from "../convex/lib/careerBoards";
import { FAST_ATS, readBoard } from "../convex/lib/careers";
import { AGGREGATORS } from "../convex/lib/company";
import { boardChanges } from "../convex/lib/boardSync";

const url = process.env.CONVEX_URL;
const secret = process.env.CAREERS_RUNNER_SECRET;
if (!url || !secret) throw new Error("Set CONVEX_URL and CAREERS_RUNNER_SECRET.");
const fresh = process.argv.includes("--fresh");
/** Reads even where scheduled jobs are off (dev has SCHEDULED_OFF=1), for testing by hand. */
const anyway = process.argv.includes("--anyway");
const client = new ConvexHttpClient(url);
const PICKED_NAMES = new Set(CAREER_BOARDS.map((b) => b.name));
/** Boards read at once. Same as the Convex read; GitHub's runner has room for more, the boards' patience doesn't. */
const AT_ONCE = 8;

/** A call to JobPipe, tried three times: one dropped connection shouldn't lose a board's changes. */
async function call<T>(run: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await run();
    } catch (e) {
      if (n >= 3 || /Not allowed/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 2000 * n));
    }
  }
}

async function main() {
  const since = Date.now();
  const plan = await call(() => client.action(api.careersRunner.plan, { secret: secret! }));
  if (plan.off && !anyway) return console.log("Scheduled jobs are off on this deployment (SCHEDULED_OFF=1).");
  // No tracks yet would mean keeping nothing; leave the table as it is.
  if (!plan.titles.length) return console.log("No tracked titles; nothing read.");
  // Same choice as careersRefresh.refresh: resellers skipped, and the daytime reads leave out fast boards, Google and Workday.
  const boards: CareerBoard[] = [...plan.picked, ...plan.found]
    .filter((b) => !AGGREGATORS.test(b.name))
    .filter((b) => !fresh || (!FAST_ATS.has(b.ats) && b.ats !== "google" && b.ats !== "workday"));

  const read: string[] = [];
  const empty: string[] = [];
  const failed: string[] = [];
  const broken: string[] = [];
  let added = 0;
  let removed = 0;

  const one = async (board: CareerBoard) => {
    const saved = await call(() => client.action(api.careersRunner.saved, { secret: secret!, company: board.name }));
    const jobs = await readBoard(board, plan.titles, new Set(saved.map((s) => s.externalId)));
    const { fresh: add, gone } = boardChanges(board.name, jobs, saved, plan.titles);
    // 50 in and 200 out per call, as before.
    for (let i = 0; i < Math.max(add.length / 50, gone.length / 200); i++) {
      await call(() => client.action(api.careersRunner.apply, { secret: secret!, add: add.slice(i * 50, i * 50 + 50), remove: gone.slice(i * 200, i * 200 + 200) }));
    }
    read.push(board.name);
    added += add.length;
    removed += gone.length;
    // Workday is searched by title, so it can rightly find nothing; the other boards list every opening.
    if (jobs.length === 0 && board.ats !== "workday" && PICKED_NAMES.has(board.name)) empty.push(board.name);
  };

  for (let i = 0; i < boards.length; i += AT_ONCE) {
    const batch = boards.slice(i, i + AT_ONCE);
    const settled = await Promise.allSettled(batch.map(one));
    settled.forEach((r, k) => {
      if (r.status !== "rejected") return;
      const b = batch[k];
      const why = String(r.reason);
      console.warn("Careers board failed:", b.name, why.slice(0, 200));
      if (!PICKED_NAMES.has(b.name)) return;
      failed.push(`${b.name} (${why.slice(0, 80)})`);
      // An error other than "too many requests": the page likely moved or closed. Workday's 429s are about speed.
      if (b.ats !== "workday" && !/429/.test(why)) broken.push(b.name);
    });
  }

  await call(() => client.action(api.careersRunner.finish, { secret: secret!, fresh, since, read, failed, empty, broken }));
  console.log(`Careers boards${fresh ? " (daytime read)" : ""}: ${read.length} of ${boards.length} read, ${added} new roles, ${removed} closed, ${failed.length} hand-picked failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
