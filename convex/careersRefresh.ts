"use node";

import { internal } from "./_generated/api";
import { v } from "convex/values";
import { type ActionCtx, env, internalAction } from "./_generated/server";
import { searchGoogleJobs, searchJobs } from "./lib/apify";
import { CAREER_BOARDS, type CareerBoard } from "./lib/careerBoards";
import { boardFingerprint, boardKey, FAST_ATS, readBoard, type CareerJob } from "./lib/careers";
import { AGGREGATORS, applyBoard } from "./lib/company";
import { isCompanyLink } from "./lib/directLink";
import { findBoard } from "./lib/boardFinder";
import { atsV } from "./careers";
import { openTo, readPlace, titleMatches } from "./lib/sources";

const INDIA = readPlace("India");

// One LinkedIn search per kind of role, shared by everyone: searching per person would cost about 20 times more.
// [search, how many to read]. SDR/BDR and AE are most members' roles and filled their 50 every day
// (13 Nov: 235 of 250), so they read 120. About $1.20 per 1,000 jobs read.
const LINKEDIN_SEARCHES: [string, number][] = [
  [`"Sales Development Representative" OR "SDR" OR "Business Development Representative" OR "BDR" OR "Inside Sales"`, 120],
  [`"Account Executive" OR "Sales Executive" OR "Business Development Executive"`, 120],
  [`"Sales Manager" OR "Sales Development Manager" OR "Business Development Manager" OR "Head of Sales"`, 50],
  [`"Account Manager" OR "Customer Success Manager" OR "Partnerships Manager"`, 50],
  [`"Solutions Engineer" OR "Sales Engineer" OR "Revenue Operations" OR "GTM"`, 50],
];
const KEEP_LINKEDIN_DAYS = 30;

/**
 * Before the morning run: today's LinkedIn sales roles in India, saved beside the careers-board roles so everyone's
 * search finds them. About $0.45 a day, capped at $0.49. Roles open the company's own apply link when LinkedIn gives one,
 * else LinkedIn's own page (lib/directLink.ts).
 */
export const linkedInPool = internalAction({
  args: {},
  handler: async (ctx) => {
    if (env.SCHEDULED_OFF === "1") return null;
    if (!env.APIFY_TOKEN) return null;
    const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
    if (!titles.length) return null;
    const settled = await Promise.allSettled(LINKEDIN_SEARCHES.map(([q, n]) => searchJobs([q], "India", false, "24h", n, (n / 1000) * 1.25, true)));
    settled.forEach((r, i) => r.status === "rejected" && console.warn("LinkedIn pool search failed:", i, String(r.reason)));
    const found = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const jobs = [...new Map(found.map((j) => [j.id, j])).values()]
      // Easy Apply jobs (no company link) are kept with their LinkedIn link since 13 Nov: 171 of 235 a day were dropped.
      .filter((j) => !AGGREGATORS.test(j.company) && titles.some((t) => titleMatches(t, j.title)))
      .map((j) => ({
        externalId: `linkedin:${j.id}`,
        company: j.company,
        title: j.title,
        location: j.location,
        workSetting: j.workSetting,
        salary: j.salary,
        postedAt: j.postedAt,
        url: isCompanyLink(j.applyUrl) ? j.applyUrl! : j.url,
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

// [plain searches, how many to read per run]. India, last 3 days (repeats are skipped when saved). SDR/BDR and AE
// first: most members' roles, and the ones careers boards list least (13 Nov: 131 SDR roles in India from boards).
// Plain titles, not "a OR b": Google read the OR searches literally and found 27 roles of 160 (13 Nov).
// About $2.50 per 1,000 jobs plus $0.005 a run.
const GOOGLE_SEARCHES: [string[], number][] = [
  [["sales development representative", "business development representative", "inside sales", "business development executive"], 80],
  [["account executive", "enterprise account executive", "sales manager", "business development manager"], 80],
];

/**
 * Before the morning run: today's Google Jobs sales roles in India, saved beside the careers-board and LinkedIn
 * roles so everyone's search finds them. About $0.40 a day. Apify won't start this actor with a cap under $0.50
 * a run, so each run's cap is $0.50; the job count (`n`) is what really limits the spend, at about $0.16 a run. Like LinkedIn's, roles open
 * the company's own apply link first, else LinkedIn, Naukri or Indeed (lib/directLink.ts).
 */
export const googlePool = internalAction({
  args: {},
  handler: async (ctx) => {
    if (env.SCHEDULED_OFF === "1") return null;
    if (!env.APIFY_TOKEN) return null;
    const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
    if (!titles.length) return null;
    const settled = await Promise.allSettled(GOOGLE_SEARCHES.map(([q, n]) => searchGoogleJobs(q, n, Math.max(0.5, (n / 1000) * 3 + 0.01))));
    settled.forEach((r, i) => r.status === "rejected" && console.warn("Google pool search failed:", i, String(r.reason)));
    const found = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const jobs = [...new Map(found.map((j) => [j.id, j])).values()]
      // The company's own link first; else LinkedIn, Naukri or Indeed (kept since 13 Nov: 29 of 70 were only there).
      .map((j) => ({ ...j, link: j.links.find((u) => isCompanyLink(u)) ?? j.links.find((u) => applyBoard(u)) }))
      .filter((j) => !!j.link && !AGGREGATORS.test(j.company) && titles.some((t) => titleMatches(t, j.title)))
      .map((j) => ({
        // "gjobs:", not "google:": Google's own careers board already uses that.
        externalId: `gjobs:${j.id}`.slice(0, 200),
        company: j.company,
        title: j.title,
        location: j.location,
        workSetting: j.workSetting,
        salary: j.salary,
        postedAt: j.postedAt,
        url: j.link!,
        india: openTo(INDIA, j.location, j.workSetting, j.title),
        description: j.description?.slice(0, 8000).replace(/[\uD800-\uDBFF]$/, ""),
      }))
      .filter((j) => j.india);
    for (let i = 0; i < jobs.length; i += 50) await ctx.runMutation(internal.careers.addJobs, { jobs: jobs.slice(i, i + 50) });
    const old: string[] = await ctx.runQuery(internal.careers.oldGoogle, { before: Date.now() - KEEP_LINKEDIN_DAYS * 86_400_000 });
    for (let i = 0; i < old.length; i += 200) await ctx.runMutation(internal.careers.removeJobs, { externalIds: old.slice(i, i + 200) });
    const boardOnly = found.filter((j) => !j.links.some((u) => isCompanyLink(u)) && j.links.some((u) => applyBoard(u))).length;
    const otherTitles = found.filter((j) => !titles.some((t) => titleMatches(t, j.title))).length;
    console.log(`Google pool: ${found.length} found, ${jobs.length} saved, ${boardOnly} kept with a job-board link, ${otherTitles} titles nobody searches, ${old.length} old ones removed.`);
    return { found: found.length, saved: jobs.length, boardOnly, otherTitles };
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
  const jobs = (AGGREGATORS.test(board.name) ? [] : read)
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
  return { added: fresh.length, removed: gone.length, total: read.length };
}

const PICKED_NAMES = new Set(CAREER_BOARDS.map((b) => b.name));

/** The hand-picked boards, with any page that moved (careersRefresh.heal) read at its new address. */
async function pickedBoards(ctx: ActionCtx): Promise<CareerBoard[]> {
  const moves: { name: string; ats: CareerBoard["ats"]; slug: string }[] = await ctx.runQuery(internal.careers.moves, {});
  const moved = new Map(moves.map((m) => [m.name, m]));
  return CAREER_BOARDS.map((b) => {
    const m = moved.get(b.name);
    // careersUrl belonged to the old page.
    return m ? { name: b.name, website: b.website, ats: m.ats, slug: m.slug } : b;
  });
}

// Boards per run. The rest go to a follow-up run, so a long list never hits the 10-minute action limit.
const CHUNK = 40;

/** Downloads every careers board once and keeps the shared table in step: new roles in, closed roles out. */
export const refresh = internalAction({
  args: { start: v.optional(v.number()), fresh: v.optional(v.boolean()), since: v.optional(v.number()) },
  handler: async (ctx, { start = 0, fresh, since = Date.now() }) => {
    if (env.SCHEDULED_OFF === "1") return null;
    const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
    // No tracks yet would mean keeping nothing; leave the table as it is.
    if (!titles.length) return null;
    let added = 0;
    let removed = 0;
    // Hand-picked companies whose page failed or listed nothing. 17 Nov: Whatfix's board had only a "test" posting
    // and Workday boards answered 429, and nobody knew: their roles just stopped reaching people.
    const empty: string[] = [];
    const failed: string[] = [];
    const broken: string[] = [];
    const one = async (board: CareerBoard) => {
      const done = await syncBoard(ctx, board, titles);
      added += done.added;
      removed += done.removed;
      // Workday is searched by title, so it can rightly find nothing; the other boards list every opening.
      if (done.total === 0 && board.ats !== "workday" && PICKED_NAMES.has(board.name)) empty.push(board.name);
    };
    // Workday boards: only the hand-picked SaaS companies. The 436 found from job links (Pfizer, FedEx, CVS…) were
    // mostly not SaaS, and every Workday board answered 429 on 17 Nov, so reading them cost money for no roles.
    const found = ((await ctx.runQuery(internal.careers.discovered, {})) as CareerBoard[]).filter((b) => b.ats !== "workday");
    // The 13:00 and 18:00 reads leave the fast boards to quickCheck; the 7:00 read still covers everything.
    // Google's site is searched at 7:00 only: each read downloads tens of MB.
    const boards = [...(await pickedBoards(ctx)), ...found].filter((b) => !fresh || (!FAST_ATS.has(b.ats) && b.ats !== "google"));
    const mine = boards.slice(start, start + CHUNK);
    // A few boards at a time: some send over 10 MB. A board that fails keeps yesterday's roles.
    for (let i = 0; i < mine.length; i += 4) {
      const batch = mine.slice(i, i + 4);
      const settled = await Promise.allSettled(batch.map(one));
      settled.forEach((r, k) => r.status === "rejected" && console.warn("Careers board failed:", batch[k].name, String(r.reason)));
      settled.forEach((r, k) => r.status === "rejected" && PICKED_NAMES.has(batch[k].name) && failed.push(`${batch[k].name} (${String(r.reason).slice(0, 80)})`));
      // Pages that answered with an error, not "too many requests": likely moved or closed. Workday is left out:
      // its 429s are about speed, and a new address wouldn't help.
      settled.forEach((r, k) => r.status === "rejected" && PICKED_NAMES.has(batch[k].name) && batch[k].ats !== "workday" && !/429/.test(String(r.reason)) && broken.push(batch[k].name));
    }
    // Once a day (the 7:00 full read), so a page that broke is fixed before its roles are missed for long.
    if (!fresh && (failed.length || empty.length)) {
      const parts = [failed.length ? `failed: ${failed.join("; ")}` : "", empty.length ? `listed no jobs: ${empty.join(", ")}` : ""].filter(Boolean);
      await ctx.runMutation(internal.errors.logServer, { message: `Hand-picked careers pages not read. ${parts.join(". ")}`, page: "careers boards" });
    }
    // Daily self-fix: look for where those pages moved, and read the new page from then on (heal).
    const toHeal = [...new Set([...empty, ...broken])];
    if (!fresh && toHeal.length) await ctx.scheduler.runAfter(0, internal.careersRefresh.heal, { names: toHeal });
    console.log(`Careers boards ${start + 1}-${start + mine.length} of ${boards.length}: ${added} new roles, ${removed} closed.`);
    if (start + CHUNK < boards.length) await ctx.scheduler.runAfter(0, internal.careersRefresh.refresh, { start: start + CHUNK, fresh, since });
    // After the last chunk, what's new goes straight to the people it fits (agent.freshRun). Until 17 Nov only
    // the daytime reads did this, so roles from the 7:00 read reached people only through the capped search.
    else await ctx.scheduler.runAfter(0, internal.agent.freshRun, { since });
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
    if (env.SCHEDULED_OFF === "1") return null;
    const since = Date.now();
    const saved: { key: string; hash: string }[] = await ctx.runQuery(internal.careers.boardHashes, {});
    const last = new Map(saved.map((s) => [s.key, s.hash]));
    const found: CareerBoard[] = await ctx.runQuery(internal.careers.discovered, {});
    const boards = [...(await pickedBoards(ctx)), ...found].filter((b) => FAST_ATS.has(b.ats));
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
    // A board seen for the first time is read now too, a few a run: until 17 Nov it was only noted, so 47
    // boards added at 14:54 waited for the next morning's full read (SpotDraft's Bengaluru AE among them).
    // Boards past the cap keep no fingerprint, so the next run picks them up.
    const NEW_PER_RUN = 15;
    const fresh = changed.filter((x) => x.isNew);
    for (const c of fresh.slice(NEW_PER_RUN)) c.hash = "";
    const toRead = [...changed.filter((x) => !x.isNew), ...fresh.slice(0, NEW_PER_RUN)];
    if (toRead.length) {
      const titles: string[] = await ctx.runQuery(internal.careers.trackTitles, {});
      for (const c of toRead) {
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

/**
 * For the owner: how big the shared job list is and how fast it grows. npx convex run --prod careersRefresh:report
 * Sources are the part of each id before the first colon (ashby, greenhouse, linkedin...).
 */
export const report = internalAction({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const now = Date.now();
    let cursor: string | null = null;
    let total = 0;
    let india = 0;
    let day = 0;
    let week = 0;
    const bySource = new Map<string, { all: number; day: number }>();
    do {
      const page: { rows: { externalId: string; india: boolean; at: number }[]; cursor: string | null } = await ctx.runQuery(internal.careers.jobsPage, { cursor });
      for (const r of page.rows) {
        total++;
        if (r.india) india++;
        const fresh = now - r.at < 86_400_000;
        if (fresh) day++;
        if (now - r.at < 7 * 86_400_000) week++;
        const src = r.externalId.split(":")[0];
        const s = bySource.get(src) ?? { all: 0, day: 0 };
        s.all++;
        if (fresh) s.day++;
        bySource.set(src, s);
      }
      cursor = page.cursor;
    } while (cursor);
    const boards: { total: number; byAts: string } = await ctx.runQuery(internal.careers.discoveredCounts, {});
    const sources = [...bySource].sort((a, b) => b[1].all - a[1].all).map(([k, s]) => `${k} ${s.all} (+${s.day})`).join(", ");
    return [
      `Open roles: ${total} (${india} in or open to India). New: ${day} in 24h, ${week} in 7 days.`,
      `By source (open, +new in 24h): ${sources}`,
      `Boards: ${CAREER_BOARDS.length} built in + ${boards.total} found (${boards.byAts}).`,
    ].join("\n");
  },
});

/**
 * Read-only: where one person's matching careers-board roles get lost. For each active track, every role in the
 * careers data that matches its titles and their place, and whether it's in their list: not saved, saved but folded
 * as weak (first guess under 40, no AI score), saved but in "Old or closed", dismissed, or shown.
 * npx convex run --prod careersRefresh:visibilityAudit '{"userId":"..."}'
 */
export const visibilityAudit = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<unknown> => {
    const me: { location: string; tracks: { name: string; status: string; company?: string; titles: string[] }[] } = await ctx.runQuery(internal.users.context, { userId });
    const place = readPlace(me.location);
    const india = place.kind === "place" && place.country === "in";
    const now = Date.now();
    const report = [];
    for (const track of me.tracks.filter((t) => t.status === "active" && !t.company)) {
      const rows: { externalId: string; company: string; title: string; location: string; workSetting?: string; postedAt?: string }[] = await ctx.runQuery(internal.careers.search, { titles: track.titles, india });
      const match = rows.filter((r) => track.titles.some((t) => titleMatches(t, r.title)) && openTo(place, r.location, r.workSetting, r.title));
      const saved: { externalId: string; status?: string; quickFit?: number | null; ai?: number | null; savedAt?: number; closed?: boolean; favorite?: boolean }[] = await ctx.runQuery(internal.jobs.savedFor, { userId, roles: match.map(({ externalId, company, title }) => ({ externalId, company, title })) });
      const byId = new Map(saved.map((s) => [s.externalId, s]));
      const stage = (r: (typeof match)[number]) => {
        const s = byId.get(r.externalId);
        if (!s || !s.status) return "not saved";
        if (s.status === "dismissed") return "dismissed";
        if (s.status !== "new") return "acted on";
        const posted = r.postedAt ? Date.parse(r.postedAt) : NaN;
        if (s.closed || now - s.savedAt! > 45 * 86_400_000 || (!Number.isNaN(posted) && now - posted > 180 * 86_400_000)) return "old or closed";
        if (s.ai === null && !s.favorite && (s.quickFit ?? 0) < 40) return "folded as weak";
        return "shown";
      };
      const roles = match.map((r) => ({ stage: stage(r), company: r.company, title: r.title, location: r.location, guess: byId.get(r.externalId)?.quickFit ?? null }));
      const counts: Record<string, number> = {};
      for (const r of roles) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
      report.push({ track: track.name, searched: rows.length, matched: match.length, counts, roles });
    }
    return report;
  },
});

/**
 * Refits every unopened job at a company not on the strong list (jobs:refitPage), page by page. Safe to start
 * again if it stops. npx convex run --prod careersRefresh:refitUnknown '{}'
 */
export const refitUnknown = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor = null }): Promise<null> => {
    const start = Date.now();
    let pages = 0;
    let changed = 0;
    let next: string | null = cursor;
    do {
      const r: { cursor: string | null; changed: number } = await ctx.runMutation(internal.jobs.refitPage, { cursor: next });
      next = r.cursor;
      changed += r.changed;
      pages++;
      // About a minute per run, then a fresh run carries on. The 8-minute runs failed twice on 17 Nov with a
      // blank "Error" (the command that started them gives up waiting), and the follow-up was never scheduled.
    } while (next && Date.now() - start < 60_000);
    console.log(`Refit unknown-company jobs: ${pages} pages, ${changed} changed${next ? ", continuing" : ", done"}.`);
    if (next) await ctx.scheduler.runAfter(0, internal.careersRefresh.refitUnknown, { cursor: next });
    return null;
  },
});

/**
 * After the 7:00 read: for each hand-picked company whose page listed nothing or failed, look for its careers page
 * again (lib/boardFinder), passing over the page we have. A page found with open roles is read in its place from
 * then on (careers.boardMoves), and the owner is told so careerBoards.ts can be updated. Whatfix's page had only a
 * "test" posting on 17 Nov, and its roles had quietly stopped reaching anyone.
 */
export const heal = internalAction({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const picked = new Map((await pickedBoards(ctx)).map((b) => [b.name, b]));
    const moved: string[] = [];
    for (const name of names) {
      const now = picked.get(name);
      if (!now?.website) continue;
      const found = await findBoard({ name, website: now.website }, `${now.ats}:${now.slug}`).catch(() => null);
      if (!found) continue;
      await ctx.runMutation(internal.careers.saveMove, { name, ...found });
      moved.push(`${name}: ${now.ats}:${now.slug} -> ${found.ats}:${found.slug}`);
    }
    console.log(`Heal: looked again for ${names.length} pages, moved ${moved.length}. ${moved.join("; ")}`);
    if (moved.length) {
      await ctx.runMutation(internal.errors.logServer, {
        message: `Careers pages moved, now reading the new ones: ${moved.join("; ")}. Check they're the right company, then update careerBoards.ts.`,
        page: "careers boards",
      });
    }
    return null;
  },
});
