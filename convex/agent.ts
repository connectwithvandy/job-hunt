"use node";

import { randomUUID } from "node:crypto";
import { ConvexError, v, type Infer } from "convex/values";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { streamChat } from "./lib/ai";
import type Anthropic from "@anthropic-ai/sdk";
import { requireUserId } from "./lib/auth";
import { buildPack, chatSystemPrompt, lessonsFromNoes, storiesFromCv, draftReferralNotes, extractJob, findAndWriteTo, findDomains, findFundedCompanies, findVcPortfolio, interviewPrep, parseResume, personaliseOutreach, researchCompany, scoreJob, scoreProspects, suggestDreamCompanies, suggestTitles, draftFormAnswers, estimatePay, type No, type PastOutcome, type Voice } from "./lib/brain";
import { companyKey } from "./lib/company";
import { MAX_STORIES } from "./lib/defaults";
import { RECHECK_AFTER, readLive, sentHome, skipReason } from "./lib/posting";
import { inBengaluru, remoteForIndia } from "./lib/places";
import { companyListings, dreamworkIdFromUrl, getListing, searchListings, type Listing } from "./lib/dreamwork";
import { htmlToText, openTo, readPlace, searchOtherSources, titleMatches, type Found } from "./lib/sources";
import type { jobV, liveCheckV, resumeV } from "./lib/validators";
import { prospectV } from "./lib/validators";

type NewJob = Infer<typeof jobV>;
type LiveCheck = Infer<typeof liveCheckV>;

/** Jobs the morning run scores per person; the rest wait a day. */
const AUTOPILOT_SCORES = 24;
type Resume = Infer<typeof resumeV>;
type Context = {
  userId: Id<"users">;
  email: string;
  resume: Resume | null;
  resumes: { _id: Id<"resumes">; resume: Resume }[];
  answers: { question: string; answer: string }[];
  resumeFor: Record<string, Resume | null>;
  location: string;
  markets: string;
  /** A sample of the candidate's own writing and their rules, so letters and messages sound like them. */
  voice: Voice;
  tracks: Doc<"tracks">[];
};

async function spend(ctx: ActionCtx, userId: Id<"users">, kind: "readCv" | "score" | "tailor" | "notes" | "addJob" | "research" | "prep" | "chat" | "search", count = 1) {
  await ctx.runMutation(internal.limits.consume, { userId, kind, count });
}

async function setup(ctx: ActionCtx): Promise<Context> {
  return await contextFor(ctx, await requireUserId(ctx));
}

async function contextFor(ctx: ActionCtx, userId: Id<"users">): Promise<Context> {
  const me: Omit<Context, "userId"> = await ctx.runQuery(internal.users.context, { userId });
  return { userId, ...me };
}

function requireResume<T>(resume: T | null): T {
  if (!resume) throw new ConvexError("Upload your CV first.");
  return resume;
}

// ---------- CV ----------

async function fileText(blob: Blob, fileName: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    // Links like "LinkedIn Profile" are clickable text, so the URL only lives in the PDF's link annotations.
    const links = new Set<string>();
    for (let i = 1; i <= pdf.numPages; i++) {
      for (const a of await (await pdf.getPage(i)).getAnnotations()) {
        if (typeof a.url === "string") links.add(a.url);
      }
    }
    return links.size ? `${text}\n\nLinks in the file: ${[...links].join(" ")}` : text;
  }
  if (name.endsWith(".docx")) return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  if (name.endsWith(".txt") || name.endsWith(".md")) return new TextDecoder().decode(bytes);
  throw new ConvexError("Upload a PDF, a Word file (.docx) or a text file.");
}

export const readCv = action({
  args: { storageId: v.id("_storage"), fileName: v.string(), replaceId: v.optional(v.id("resumes")), label: v.optional(v.string()) },
  handler: async (ctx, { storageId, fileName, replaceId, label }): Promise<{ roles: number; resumeId: Id<"resumes"> }> => {
    const userId = await requireUserId(ctx);
    try {
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new ConvexError("Upload failed. Try again.");
      if (blob.size > 10_000_000) throw new ConvexError("That file is over 10 MB.");
      const text = (await fileText(blob, fileName)).trim();
      if (text.length < 200) {
        throw new ConvexError("Couldn't read text from that file. If it's a scanned image, export it from Canva or Word as a text PDF.");
      }
      await spend(ctx, userId, "readCv");
      const resume = await parseResume(text);
      const resumeId: Id<"resumes"> = await ctx.runMutation(internal.users.storeParsedResume, { userId, resume, replaceId, label });
      return { roles: resume.experience.length, resumeId };
    } finally {
      // The CV text now lives in the profile; the uploaded file isn't needed.
      await ctx.storage.delete(storageId);
    }
  },
});

// ---------- Finding jobs ----------

function fromListing(l: Listing, trackKey: string): NewJob {
  const now = Date.now();
  return {
    externalId: l.id,
    source: "dreamwork",
    url: l.url,
    sourceUrl: l.sourceUrl ?? undefined,
    title: l.title,
    company: l.company ?? "Unknown company",
    // Searches without a place can return listings with no location.
    location: l.location ?? (l.workSetting === "remote" ? "Remote" : "Not listed"),
    workSetting: l.workSetting ?? undefined,
    salary: l.salary ?? undefined,
    postedAt: l.postedAt ?? l.firstSeenAt ?? undefined,
    foundFor: trackKey,
    status: "new",
    outreach: [],
    updatedAt: now,
  };
}

function fromFound(f: Found, trackKey: string): NewJob {
  return {
    externalId: `${f.source}:${f.id}`,
    source: f.source,
    url: f.url,
    sourceUrl: f.url,
    title: f.title,
    company: f.company,
    companyLogo: f.companyLogo,
    location: f.location,
    workSetting: f.workSetting,
    salary: f.salary,
    postedAt: f.postedAt,
    description: f.description,
    foundFor: trackKey,
    status: "new",
    outreach: [],
    updatedAt: Date.now(),
  };
}

export const findJobs = action({
  args: { trackKey: v.string() },
  handler: async (ctx, { trackKey }): Promise<{ added: number; trackName: string }> => {
    const { userId, tracks, location } = await setup(ctx);
    const track = tracks.find((t) => t.key === trackKey);
    if (!track) throw new ConvexError("Unknown track.");
    await spend(ctx, userId, "search");
    return { added: await searchTrack(ctx, userId, track, location), trackName: track.name };
  },
});

type CareerRow = { externalId: string; company: string; title: string; location: string; workSetting?: string; salary?: string; postedAt?: string; url: string; india: boolean };

/** Turns careers-board roles into found jobs, with their descriptions. */
async function withCareerTexts(ctx: ActionCtx, rows: CareerRow[]): Promise<Found[]> {
  const texts: { externalId: string; description: string }[] = rows.length ? await ctx.runQuery(internal.careers.texts, { externalIds: rows.map((r) => r.externalId) }) : [];
  const text = new Map(texts.map((t) => [t.externalId, t.description]));
  return rows.map((r) => ({ source: "careers", id: r.externalId, title: r.title, company: r.company, location: r.location, workSetting: r.workSetting, salary: r.salary, postedAt: r.postedAt, url: r.url, description: text.get(r.externalId) }));
}

/** Roles from the companies' own careers boards (read each morning) that match a title and the place. */
async function careerMatches(ctx: ActionCtx, titles: string[], location: string): Promise<Found[]> {
  const place = readPlace(location);
  const rows: CareerRow[] = await ctx.runQuery(internal.careers.search, { titles, india: place.kind === "place" && place.country === "in" });
  return await withCareerTexts(ctx, rows.filter((r) => titles.some((t) => titleMatches(t, r.title)) && openTo(place, r.location, r.workSetting, r.title)).slice(0, 100));
}

/** Searches every board for one track and saves the new roles. Returns how many were new. */
async function searchTrack(ctx: ActionCtx, userId: Id<"users">, track: Doc<"tracks">, location: string, googleTitles = 2): Promise<number> {
    const [settled, others] = await Promise.all([
      track.company
        ? Promise.allSettled([companyListings(track.company)])
        : Promise.allSettled(track.titles.slice(0, 16).map((title, i) => searchListings(title, location, 25, i < 3 ? 3 : 2))),
      track.company ? Promise.resolve([]) : Promise.all([searchOtherSources(track.titles, location, googleTitles), careerMatches(ctx, track.titles, location)]).then((r) => r.flat()),
    ]);
    // Dreamwork also matches company names, so keep only titles holding the searched words.
    const listings = settled.flatMap((r, i) => (r.status !== "fulfilled" ? [] : track.company ? r.value : r.value.filter((l) => titleMatches(track.titles[i], l.title))));
    if (!listings.length && !others.length && settled.every((r) => r.status === "rejected")) {
      const reason = (settled[0] as PromiseRejectedResult).reason;
      throw reason instanceof ConvexError ? reason : new ConvexError("Dreamwork didn't answer. Try again in a minute.");
    }
    // The same role often shows up on several boards; keep the first copy, Dreamwork's when there is one.
    const sameRole = (j: NewJob) => `${j.company}|${j.title}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
    const all = [...listings.map((l) => fromListing(l, track.key)), ...others.map((f) => fromFound(f, track.key))];
    const unique = [...new Map(all.reverse().map((j) => [sameRole(j), j])).values()];
    const { added }: { added: number } = await ctx.runMutation(internal.jobs.insertMany, { userId, jobs: unique });
    return added;
}

export const addJob = action({
  args: { link: v.optional(v.string()), text: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Id<"jobs">> => await addJobFor(ctx, (await setup(ctx)).userId, args),
});

async function addJobFor(ctx: ActionCtx, userId: Id<"users">, args: { link?: string; text?: string }): Promise<Id<"jobs">> {
    const link = args.link?.trim() ?? "";
    const pasted = args.text?.trim() ?? "";
    if (!link && !pasted) throw new ConvexError("Paste a job link, or the job description.");
    if (link && !/^https?:\/\//i.test(link)) throw new ConvexError("That link should start with https://");
    if (link && !publicUrl(link)) throw new ConvexError("That link doesn't point to a public website.");
    const now = Date.now();

    let job: NewJob;
    const dwId = link ? dreamworkIdFromUrl(link) : null;
    if (dwId) {
      const l = await getListing(dwId);
      const raw = l as unknown as Record<string, string>;
      job = {
        externalId: dwId, source: "dreamwork", url: link, sourceUrl: l.sourceUrl ?? undefined,
        title: raw.title, company: raw.companyName, location: raw.location ?? "", workSetting: raw.remoteType ?? undefined,
        description: l.description ?? undefined, companyLogo: l.companyLogoUrl ?? undefined, seniority: l.seniorityLevel ?? undefined,
        status: "new", outreach: [], updatedAt: now,
      };
    } else {
      await spend(ctx, userId, "addJob");
      let text = pasted;
      if (!text) {
        const res = await fetch(link, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) job-hunt" }, redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(() => null);
        text = res?.ok && publicUrl(res.url || link) ? htmlToText((await res.text()).slice(0, 2_000_000)) : "";
        if (text.length < 400) {
          throw new ConvexError("That site didn't let us read the job. Open it, copy the description, and paste it in instead.");
        }
      }
      const x = await extractJob(text);
      if (!x.isJobPosting) throw new ConvexError("That doesn't look like a job posting.");
      job = {
        externalId: link || randomUUID(), source: link ? "link" : "pasted", url: link, sourceUrl: link || undefined,
        title: x.title, company: x.company, location: x.location, workSetting: x.workSetting,
        description: x.description, status: "new", outreach: [], updatedAt: now,
      };
    }
    const { lastId }: { lastId: Id<"jobs"> | null } = await ctx.runMutation(internal.jobs.insertMany, { userId, jobs: [job] });
    return lastId!;
}

/** Only fetch public sites, never the server's own network. */
function publicUrl(link: string) {
  let host: string;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return false;
  // Bare IP addresses (v4 or v6) are never job boards.
  return !/^[\d.]+$/.test(host) && !host.startsWith("[");
}

// ---------- Is it still open? ----------

/** Looks at the posting itself, for free: the careers board's morning copy, or the job's own page. */
async function liveState(ctx: ActionCtx, job: Doc<"jobs">): Promise<LiveCheck> {
  const at = Date.now();
  if (job.source === "careers") {
    const listed: boolean = await ctx.runQuery(internal.careers.isListed, { externalId: job.externalId.replace(/^careers:/, "") });
    return listed ? { at, state: "open", note: "Still on the company's careers board as of this morning." } : { at, state: "closed", note: "The company took it off its careers board." };
  }
  const link = job.sourceUrl || job.url;
  if (!link || !publicUrl(link)) return { at, state: "unknown", note: "There's no link to check. Open the posting to make sure it's up." };
  // Ashby builds its pages in the browser, so read its public job list instead.
  const ashby = link.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{36})/i);
  if (ashby) {
    const board = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ashby[1])}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const body = board?.ok ? ((await board.json()) as { jobs?: { id: string }[] }) : null;
    if (body?.jobs) {
      return body.jobs.some((j) => j.id.toLowerCase() === ashby[2].toLowerCase())
        ? { at, state: "open", note: "Still on the company's Ashby job board." }
        : { at, state: "closed", note: "No longer on the company's Ashby job board." };
    }
  }
  const res = await fetch(link, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) job-hunt" }, redirect: "follow", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const landed = res?.url || link;
  if (!res || !publicUrl(landed)) return { at, state: "unknown", note: "The site didn't answer. Open the posting to check." };
  const text = res.ok ? htmlToText((await res.text()).slice(0, 2_000_000)) : "";
  return { at, ...readLive(res.status, text, sentHome(link, landed)) };
}

async function checkAndSave(ctx: ActionCtx, userId: Id<"users">, job: Doc<"jobs">) {
  const liveCheck = await liveState(ctx, job);
  await ctx.runMutation(internal.jobs.saveLiveCheck, { userId, jobId: job._id, liveCheck });
  return liveCheck;
}

/** Checks the posting is still up. No AI, so it doesn't use any of the day's allowance. */
export const checkPosting = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<LiveCheck["state"]> => {
    const userId = await requireUserId(ctx);
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    return (await checkAndSave(ctx, userId, job)).state;
  },
});

// ---------- Scoring ----------

async function withDescription(job: Doc<"jobs">) {
  if (job.description || job.source !== "dreamwork") return job;
  const l = await getListing(job.externalId);
  // Dreamwork sends null for missing fields; the database wants them left out.
  return { ...job, description: l.description ?? undefined, companyLogo: l.companyLogoUrl ?? undefined, seniority: l.seniorityLevel ?? undefined };
}

export const scoreJobs = action({
  args: { jobIds: v.array(v.id("jobs")) },
  handler: async (ctx, { jobIds }): Promise<{ scored: number; failed: number }> => {
    const me = await setup(ctx);
    const ids = jobIds.slice(0, 12);
    await spend(ctx, me.userId, "score", ids.length);
    const { scored, failed, lastError } = await scoreIds(ctx, me, ids);
    if (failed === ids.length) throw new ConvexError(lastError);
    return { scored, failed };
  },
});

/** Scores jobs four at a time, each track against its own CV. Doesn't spend allowance; callers do. */
async function scoreIds(ctx: ActionCtx, { userId, resume, resumeFor, tracks, location, markets }: Context, ids: Id<"jobs">[]) {
    const cv = requireResume(resume);
    const past: PastOutcome[] = await ctx.runQuery(internal.jobs.pastOutcomes, { userId, now: Date.now() });
    const cvFor = (t: { key: string }) => resumeFor[t.key] ?? cv;
    let failed = 0;
    let lastError = "";
    // Four at a time, so twelve jobs take about as long as three.
    for (let i = 0; i < ids.length; i += 4) {
      await Promise.all(
        ids.slice(i, i + 4).map(async (jobId) => {
          try {
            const job = await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
            const s = await scoreJob(job, cvFor, tracks, location, markets, past);
            await ctx.runMutation(internal.jobs.patchForAction, {
              userId,
              jobId,
              description: job.description,
              companyLogo: job.companyLogo,
              seniority: job.seniority,
              scores: s.scores.map((x) => ({ trackKey: x.trackId, score: Math.max(0, Math.min(100, Math.round(x.score))), reason: x.reason, gaps: x.gaps })),
              brief: { whatTheyWant: s.whatTheyWant, watchOuts: s.watchOuts, blocker: s.blocker.trim() || undefined },
            });
          } catch (err) {
            failed++;
            lastError = err instanceof ConvexError ? String(err.data) : "Something went wrong.";
          }
        }),
      );
    }
    return { scored: ids.length - failed, failed, lastError };
}

// ---------- Autopilot ----------

/** Every morning: search each active track for people who turned autopilot on, then score what's new. */
export const dailyRun = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds: Id<"users">[] = await ctx.runQuery(internal.users.autopilotUsers, {});
    // One run per person, a little apart, so one slow person can't stop the rest.
    for (const [i, userId] of userIds.entries()) await ctx.scheduler.runAfter(i * 30_000, internal.agent.autopilotFor, { userId });
    return null;
  },
});

export const autopilotFor = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    try {
      // Someone taken off the app doesn't keep spending in the background.
      const allowed: boolean = await ctx.runQuery(internal.access.allowed, { userId });
      if (!allowed) return null;
      const me = await contextFor(ctx, userId);
      let added = 0;
      // One Google Jobs title per track keeps a month of mornings inside JSearch's free 200 searches.
      for (const track of me.tracks.filter((t) => t.status === "active")) {
        try {
          added += await searchTrack(ctx, userId, track, me.location, 1);
        } catch (err) {
          console.warn("Autopilot search failed", track.key, String(err));
        }
      }
      let scored = 0;
      const unscored: Id<"jobs">[] = await ctx.runQuery(internal.jobs.unscoredIds, { userId, limit: AUTOPILOT_SCORES });
      if (unscored.length && me.resume) {
        // Twelve at a time, so a nearly used-up allowance still scores what it can.
        for (let i = 0; i < unscored.length; i += 12) {
          const batch = unscored.slice(i, i + 12);
          try {
            await spend(ctx, userId, "score", batch.length);
          } catch (err) {
            // Out of today's allowance: the rest wait for tomorrow.
            console.warn("Autopilot scoring stopped", String(err));
            break;
          }
          scored += (await scoreIds(ctx, me, batch)).scored;
        }
      }
      // Companies that just raised money and new YC companies, once a week on Mondays: funding news moves slowly.
      let funded = 0;
      try {
        if (new Date().getUTCDay() === 1) {
          funded = await addFunded(ctx, me, "india_remote");
          await addYc(ctx, me, "india_remote");
        }
      } catch (err) {
        console.warn("Autopilot company search failed", String(err));
      }
      // Watch the Dream 20 for new sales and GTM openings too.
      const dreams: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.dreamsForAction, { userId });
      for (const p of dreams) {
        try {
          await ctx.runMutation(internal.prospects.recordRoles, { userId, prospectId: p._id, openRoles: await checkCompanyRoles(ctx, me, p) });
        } catch (err) {
          console.warn("Autopilot role check failed", p.name, String(err));
        }
      }
      // Check the jobs worth applying to are still up, so Today never sends you to a closed one.
      const toCheck: Id<"jobs">[] = await ctx.runQuery(internal.jobs.toCheckLive, { userId, before: Date.now() - RECHECK_AFTER });
      for (const jobId of toCheck) {
        try {
          await checkAndSave(ctx, userId, (await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
        } catch (err) {
          console.warn("Live check failed", String(err));
        }
      }
      const strong: number = await ctx.runQuery(internal.jobs.strongSince, { userId, since: Date.now() - 86_400_000 });
      await ctx.runMutation(internal.users.recordAutopilot, { userId, added, scored, strong, funded });
    } catch (err) {
      console.error("Autopilot failed for a user", String(err));
    }
    return null;
  },
});

// ---------- Applying ----------

export const tailor = action({
  args: { jobId: v.id("jobs"), trackKey: v.optional(v.string()), resumeId: v.optional(v.id("resumes")), feedback: v.optional(v.string()), anyway: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<null> => await tailorFor(ctx, await setup(ctx), args),
});

async function tailorFor(
  ctx: ActionCtx,
  { userId, resume, resumes, resumeFor, tracks, voice }: Context,
  { jobId, trackKey, resumeId, feedback, anyway }: { jobId: Id<"jobs">; trackKey?: string; resumeId?: Id<"resumes">; feedback?: string; anyway?: boolean },
): Promise<null> {
    const saved = (await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">;
    // Before the most expensive step, make sure it's worth it: still open, nothing ruling you out, a fit above the line.
    const live = !anyway && !saved.pack && (!saved.liveCheck || Date.now() - saved.liveCheck.at > RECHECK_AFTER) ? await checkAndSave(ctx, userId, saved) : saved.liveCheck;
    const skip = skipReason({ ...saved, liveCheck: live });
    if (skip && !anyway && !saved.pack) throw new ConvexError(`${skip} If you still want to apply, choose "Write it anyway".`);
    const job = await withDescription(saved);
    // No track picked: use the best-scoring one if the job was scored, otherwise pitch straight at the job.
    const best = [...(job.scores ?? [])].sort((a, b) => b.score - a.score)[0]?.trackKey;
    const track = tracks.find((t) => t.key === (trackKey ?? best)) ?? null;
    if (trackKey && !track) throw new ConvexError("Unknown track.");
    const chosen = resumeId ? resumes.find((r) => r._id === resumeId)?.resume : undefined;
    if (resumeId && !chosen) throw new ConvexError("That CV is gone. Pick another.");
    const cv = requireResume(chosen ?? (track ? resumeFor[track.key] : resume));
    await spend(ctx, userId, "tailor");
    const notes = feedback?.trim().slice(0, 2000);
    const pack = await buildPack(job, cv, track, notes ? { notes, previous: job.pack } : undefined, voice);
    await ctx.runMutation(internal.jobs.patchForAction, { userId, jobId, description: job.description, pack, trackKey: track?.key, ...(skip && anyway ? { wroteAnyway: true } : {}) });
    return null;
}

export const draftNotes = action({
  args: { jobId: v.id("jobs"), contactIds: v.array(v.id("contacts")) },
  handler: async (ctx, { jobId, contactIds }): Promise<{ drafted: number }> => {
    const { userId, resume, resumeFor, tracks, voice } = await setup(ctx);
    if (!contactIds.length) throw new ConvexError("Pick at least one person.");
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    const best = [...(job.scores ?? [])].sort((a, b) => b.score - a.score)[0]?.trackKey;
    const track = tracks.find((t) => t.key === (job.trackKey ?? best ?? job.foundFor)) ?? null;
    const cv = requireResume(job.pack?.resume ?? (track ? resumeFor[track.key] : resume));
    const people: Doc<"contacts">[] = await ctx.runQuery(internal.jobs.contactsForAction, { userId, ids: contactIds });
    await spend(ctx, userId, "notes");
    const notes = await draftReferralNotes(job, cv, track, people, voice);
    const entries = notes.flatMap((n) => {
      const p = people.find((c) => c._id === n.contactId);
      return p ? [{ contactId: p._id, name: `${p.firstName} ${p.lastName}`, position: p.position, url: p.linkedinUrl, message: n.message, status: "draft" as const }] : [];
    });
    await ctx.runMutation(internal.jobs.mergeOutreachForAction, { userId, jobId, entries });
    return { drafted: notes.length };
  },
});

// ---------- Company research and interview prep ----------

export const research = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<null> => await researchFor(ctx, await requireUserId(ctx), jobId),
});

async function researchFor(ctx: ActionCtx, userId: Id<"users">, jobId: Id<"jobs">): Promise<null> {
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    await spend(ctx, userId, "research");
    const found = await researchCompany(job);
    await ctx.runMutation(internal.jobs.saveExtras, { userId, jobId, research: { createdAt: Date.now(), ...found } });
    return null;
}

/** Researches what to ask for in one of your roles. */
export const estimateRolePay = action({
  args: { trackKey: v.string() },
  handler: async (ctx, { trackKey }): Promise<null> => {
    const me = await setup(ctx);
    const track = me.tracks.find((t) => t.key === trackKey);
    if (!track) throw new ConvexError("That role is gone.");
    const cv = requireResume(me.resumeFor[track.key] ?? me.resume);
    await spend(ctx, me.userId, "research");
    const out = await estimatePay(track, cv, me.location);
    const low = Math.round(Math.min(out.low, out.high));
    const high = Math.round(Math.max(out.low, out.high));
    await ctx.runMutation(internal.users.savePayForAction, {
      userId: me.userId,
      trackKey,
      pay: { low, high, currency: out.currency.toUpperCase().slice(0, 3), basis: out.basis, sources: out.sources.slice(0, 5), at: Date.now() },
    });
    return null;
  },
});

export const prep = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<null> => await prepFor(ctx, await setup(ctx), jobId),
});

async function prepFor(ctx: ActionCtx, { userId, resume, resumeFor, tracks }: Context, jobId: Id<"jobs">): Promise<null> {
    const job = await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
    const track = tracks.find((t) => t.key === (job.trackKey ?? job.pack?.trackKey ?? job.foundFor)) ?? null;
    const cv = requireResume(job.pack?.resume ?? (track ? resumeFor[track.key] : resume));
    await spend(ctx, userId, "prep");
    const bank: Doc<"stories">[] = await ctx.runQuery(internal.stories.forAction, { userId });
    const out = await interviewPrep(job, cv, track, job.research, bank);
    // New stories join your bank; bank stories are marked as used for this job.
    const ids: (Id<"stories"> | null)[] = await ctx.runMutation(internal.stories.fileForAction, {
      userId,
      jobId,
      stories: out.stories.map(({ storyId, angle, ...story }) => ({ storyId: storyId || undefined, story })),
    });
    const stories = out.stories.map(({ title, situation, action, result, reflection, angle }, i) => ({ title, situation, action, result, reflection, angle, storyId: ids[i] ?? undefined }));
    // Keep the description fetched for this, so the next run doesn't fetch it again.
    await ctx.runMutation(internal.jobs.saveExtras, { userId, jobId, prep: { createdAt: Date.now(), ...out, stories }, description: job.description });
    return null;
}

/** Writes your master interview stories from your CVs, to fill the story bank. */
export const buildStoryBank = action({
  args: {},
  handler: async (ctx): Promise<{ added: number }> => {
    const { userId, resumes } = await setup(ctx);
    if (!resumes.length) throw new ConvexError("Upload your CV first.");
    const bank: Doc<"stories">[] = await ctx.runQuery(internal.stories.forAction, { userId });
    const count = Math.min(8, MAX_STORIES - bank.length);
    if (count <= 0) throw new ConvexError(`Your bank is full at ${MAX_STORIES} stories. Delete one you never use first.`);
    await spend(ctx, userId, "prep");
    const found = await storiesFromCv(resumes.map((r) => r.resume), bank, count);
    const ids: (Id<"stories"> | null)[] = await ctx.runMutation(internal.stories.fileForAction, { userId, stories: found.map((story) => ({ story })) });
    return { added: ids.filter((id) => id && !bank.some((b) => b._id === id)).length };
  },
});

// ---------- Learning from noes ----------

/** Reads your rejections and silences together and names the gaps that keep costing you. */
export const learnFromNoes = action({
  args: {},
  handler: async (ctx): Promise<null> => {
    const me = await setup(ctx);
    const cv = requireResume(me.resume);
    const { noes, replies }: { noes: No[]; replies: number } = await ctx.runQuery(internal.jobs.noesForAction, { userId: me.userId, now: Date.now() });
    if (noes.length < 3) throw new ConvexError(`This needs three noes or silences to find a pattern. You have ${noes.length} so far.`);
    await spend(ctx, me.userId, "research");
    const out = await lessonsFromNoes(noes, replies, cv, me.tracks);
    await ctx.runMutation(internal.users.saveLessonsForAction, {
      userId: me.userId,
      lessons: { at: Date.now(), basedOn: noes.length, summary: out.summary, items: out.items.slice(0, 3).map((i) => ({ ...i, seen: Math.max(0, Math.round(i.seen)) })) },
    });
    return null;
  },
});

// ---------- Contact lookup ----------

/** Whether the email finder is switched on, so the page only shows the button when it works. */
export const canFindEmails = action({
  args: {},
  handler: async (): Promise<boolean> => !!process.env.HUNTER_API_KEY,
});

/** Looks up a contact's work email with Hunter.io from their name and company. */
export const findEmail = action({
  args: { jobId: v.id("jobs"), contactId: v.string() },
  handler: async (ctx, { jobId, contactId }): Promise<{ email: string; confidence: number }> => {
    const key = process.env.HUNTER_API_KEY;
    if (!key) throw new ConvexError("Email lookup isn't switched on: add a Hunter.io key first.");
    const userId = await requireUserId(ctx);
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    const person = job.hiringContacts?.find((c) => c.id === contactId);
    if (!person) throw new ConvexError("That person isn't on this job any more.");
    const [first, ...rest] = person.name.trim().split(/\s+/);
    if (!rest.length) throw new ConvexError("Add their full name first, so the lookup can match them.");
    await spend(ctx, userId, "research");
    const params = new URLSearchParams({ company: job.company, first_name: first, last_name: rest.join(" "), api_key: key });
    const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`, { signal: AbortSignal.timeout(20_000) });
    const body = (await res.json()) as { data?: { email: string | null; score: number | null; phone_number?: string | null }; errors?: { details: string }[] };
    if (!res.ok) throw new ConvexError(`Hunter.io: ${body.errors?.[0]?.details ?? `answered ${res.status}`}`);
    if (!body.data?.email) throw new ConvexError(`No email found for ${person.name} at ${job.company}.`);
    await ctx.runMutation(internal.jobs.updateContactForAction, {
      userId, jobId, contactId,
      patch: { email: body.data.email, ...(person.phone || !body.data.phone_number ? {} : { phone: body.data.phone_number }) },
    });
    return { email: body.data.email, confidence: body.data.score ?? 0 };
  },
});

/** Finds common ground with one contact and rewrites the note and email for them. */
export const personalise = action({
  args: { jobId: v.id("jobs"), contactId: v.string(), profileText: v.optional(v.string()), searchWeb: v.boolean() },
  handler: async (ctx, { jobId, contactId, profileText, searchWeb }): Promise<null> => {
    const { userId, resumes, voice } = await setup(ctx);
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    const person = job.hiringContacts?.find((c) => c.id === contactId);
    if (!person) throw new ConvexError("That person isn't on this job any more.");
    const pasted = profileText?.trim() || person.profileText;
    if (!pasted && !searchWeb) throw new ConvexError("Paste their LinkedIn profile, or tick the web search box.");
    if (!resumes.length) throw new ConvexError("Upload your CV first.");
    await spend(ctx, userId, "notes");
    const out = await personaliseOutreach(job, resumes.map((r) => r.resume), { ...person, profileText: pasted }, searchWeb, false, voice);
    await ctx.runMutation(internal.jobs.updateContactForAction, {
      userId, jobId, contactId,
      patch: { profileText: pasted, commonGround: out.commonGround, note: out.note, emailSubject: out.emailSubject, email2: out.email },
    });
    return null;
  },
});

// ---------- Companies to approach ----------

type NewProspect = Infer<typeof prospectV>;

type YcCompany = {
  name: string; slug: string; website: string; one_liner: string; industry: string; subindustry: string; industries: string[];
  regions: string[]; all_locations: string; team_size: number | null; batch: string; status: string; isHiring: boolean;
  nonprofit: boolean; url: string; small_logo_thumb_url: string;
};

/** Recent, active YC startups in your place, the hiring ones first, that aren't in your list yet. */
async function ycCandidates(location: string, skip: Set<string>, limit: number, indiaOrRemote: boolean): Promise<NewProspect[]> {
  const res = await fetch("https://yc-oss.github.io/api/companies/all.json", { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new ConvexError("The YC directory didn't answer. Try again in a minute.");
  const all = (await res.json()) as YcCompany[];
  const place = readPlace(location);
  const year = (b: string) => Number(b.match(/\d{4}/)?.[0] ?? 0);
  const where = (c: YcCompany) => {
    const text = `${c.regions.join(" ")} ${c.all_locations}`.toLowerCase();
    if (indiaOrRemote) return text.includes("india") || text.includes("remote");
    if (place.kind === "anywhere") return true;
    if (place.kind === "remote") return text.includes("remote");
    return text.includes(place.name.toLowerCase()) || (place.country === "in" && text.includes("india"));
  };
  return all
    .filter((c) => c.status === "Active" && !c.nonprofit && year(c.batch) >= 2020)
    .filter((c) => (c.team_size ?? 0) >= 8 && (c.team_size ?? 0) <= 500)
    .filter((c) => c.industry === "B2B" || c.industries?.includes("B2B") || c.industry === "Fintech")
    .filter((c) => where(c) && !skip.has(companyKey(c.name)))
    .sort((a, b) => Number(b.isHiring) - Number(a.isHiring) || year(b.batch) - year(a.batch))
    .slice(0, limit)
    .map((c) => ({
      key: companyKey(c.name),
      name: c.name,
      website: c.website,
      source: "yc" as const,
      oneLiner: c.one_liner,
      industry: c.subindustry || c.industry,
      location: c.all_locations || c.regions.join(", "),
      teamSize: c.team_size ?? undefined,
      batch: c.batch,
      ycUrl: c.url,
      logo: c.small_logo_thumb_url || undefined,
      isHiring: c.isHiring,
      status: "new" as const,
      contacts: [],
      updatedAt: Date.now(),
    }));
}

/** Scores newly saved companies against your CVs, fifteen per call. */
async function fitProspects(ctx: ActionCtx, me: Context, ids: Id<"prospects">[]) {
  const rows: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.forAction, { userId: me.userId, ids });
  const cvs = me.resumes.map((r) => r.resume);
  for (let i = 0; i < rows.length; i += 15) {
    const batch = rows.slice(i, i + 15);
    const fits = await scoreProspects(batch, cvs, me.tracks);
    for (const f of fits) {
      const row = batch.find((r) => r.key === f.key);
      if (row) {
        await ctx.runMutation(internal.prospects.patchForAction, {
          userId: me.userId,
          prospectId: row._id,
          fit: { score: Math.max(0, Math.min(100, Math.round(f.score))), reason: f.reason, angle: f.angle },
        });
      }
    }
  }
}

/** India or remote only, whatever your Roles page says; the default for company searches. */
const scopeV = v.union(v.literal("india_remote"), v.literal("profile"));

export const findYcCompanies = action({
  args: { scope: v.optional(scopeV) },
  handler: async (ctx, { scope = "india_remote" }): Promise<{ added: number }> => {
    const me = await setup(ctx);
    if (!me.resumes.length) throw new ConvexError("Upload your CV first.");
    return { added: await addYc(ctx, me, scope) };
  },
});

async function addYc(ctx: ActionCtx, me: Context, scope: "india_remote" | "profile"): Promise<number> {
  const skip = new Set<string>(await ctx.runQuery(internal.prospects.keysForAction, { userId: me.userId }));
  const found = await ycCandidates(me.location, skip, 30, scope === "india_remote");
  const ids: Id<"prospects">[] = await ctx.runMutation(internal.prospects.insertMany, { userId: me.userId, prospects: found });
  if (ids.length) {
    await spend(ctx, me.userId, "score", Math.ceil(ids.length / 15));
    await fitProspects(ctx, me, ids);
  }
  return ids.length;
}

export const findFunded = action({
  args: { scope: v.optional(scopeV) },
  handler: async (ctx, { scope = "india_remote" }): Promise<{ added: number }> => {
    const me = await setup(ctx);
    if (!me.resumes.length) throw new ConvexError("Upload your CV first.");
    return { added: await addFunded(ctx, me, scope) };
  },
});

const DEFAULT_VCS = ["Accel", "Peak XV", "Lightspeed", "Elevation Capital", "Z47", "Blume Ventures", "Nexus Venture Partners", "Bessemer", "a16z", "Sequoia"];

export const findFromVcs = action({
  args: { vcs: v.optional(v.array(v.string())) },
  handler: async (ctx, { vcs }): Promise<{ added: number }> => {
    const me = await setup(ctx);
    if (!me.resumes.length) throw new ConvexError("Upload your CV first.");
    await spend(ctx, me.userId, "research");
    const firms = (vcs ?? DEFAULT_VCS).map((s) => s.trim()).filter(Boolean).slice(0, 15);
    const skip: string[] = await ctx.runQuery(internal.prospects.keysForAction, { userId: me.userId });
    const where = `${readPlace(me.location).kind === "place" ? me.location : "India"}, or hiring remotely in India`;
    const found = await findVcPortfolio(firms, where, me.tracks.filter((t) => t.status === "active").map((t) => t.name), skip);
    const ids: Id<"prospects">[] = await ctx.runMutation(internal.prospects.insertMany, {
      userId: me.userId,
      prospects: found.map((c) => ({
        key: companyKey(c.name), name: c.name, website: c.website, source: "vc" as const, oneLiner: c.oneLiner, industry: c.industry,
        location: c.location, teamSize: c.teamSize || undefined, funding: c.funding, fundingSource: c.sourceUrl, status: "new" as const, contacts: [], updatedAt: Date.now(),
      })),
    });
    if (ids.length) await fitProspects(ctx, me, ids);
    return { added: ids.length };
  },
});

/** Searches recent funding news, saves the new companies and scores them for fit. */
async function addFunded(ctx: ActionCtx, me: Context, scope: "india_remote" | "profile"): Promise<number> {
  await spend(ctx, me.userId, "research");
  const skip: string[] = await ctx.runQuery(internal.prospects.keysForAction, { userId: me.userId });
  const where = scope === "india_remote" ? `${readPlace(me.location).kind === "place" ? me.location : "India"}, or hiring remotely in India` : me.location;
  const found = await findFundedCompanies(where, me.tracks.filter((t) => t.status === "active").map((t) => t.name), skip);
  const prospects: NewProspect[] = found.map((c) => ({
    key: companyKey(c.name),
    name: c.name,
    website: c.website,
    source: "funded",
    oneLiner: c.oneLiner,
    industry: c.industry,
    location: c.location,
    teamSize: c.teamSize || undefined,
    funding: c.funding,
    fundingSource: c.sourceUrl,
    status: "new",
    contacts: [],
    updatedAt: Date.now(),
  }));
  const ids: Id<"prospects">[] = await ctx.runMutation(internal.prospects.insertMany, { userId: me.userId, prospects });
  if (ids.length) await fitProspects(ctx, me, ids);
  return ids.length;
}

/** Common ground and an early-approach note for one person at a company with no posted role. */
export const personaliseProspect = action({
  args: { prospectId: v.id("prospects"), contactId: v.string(), profileText: v.optional(v.string()), searchWeb: v.boolean() },
  handler: async (ctx, { prospectId, contactId, profileText, searchWeb }): Promise<null> => {
    const { userId, resumes, voice } = await setup(ctx);
    const [p]: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.forAction, { userId, ids: [prospectId] });
    if (!p) throw new ConvexError("Company not found.");
    const person = p.contacts.find((c) => c.id === contactId);
    if (!person) throw new ConvexError("That person isn't on this company any more.");
    const pasted = profileText?.trim() || person.profileText;
    if (!pasted && !searchWeb) throw new ConvexError("Paste their LinkedIn profile, or tick the web search box.");
    await spend(ctx, userId, "notes");
    const asJob = { title: "(no role posted)", company: p.name, location: p.location, description: `${p.oneLiner}. ${p.funding ?? (p.batch ? `YC ${p.batch}` : "")}`, url: p.website };
    const out = await personaliseOutreach(asJob, resumes.map((r) => r.resume), { ...person, profileText: pasted }, searchWeb, true, voice);
    await ctx.runMutation(internal.prospects.updateContactForAction, {
      userId, prospectId, contactId,
      patch: { profileText: pasted, commonGround: out.commonGround, note: out.note, emailSubject: out.emailSubject, email2: out.email },
    });
    return null;
  },
});

/** One tap: find who holds a role at a company, save them, and write them a note and email. */
export const reachOutTo = action({
  args: { prospectId: v.id("prospects"), role: v.string() },
  handler: async (ctx, { prospectId, role }): Promise<string> => {
    const { userId, resumes, voice } = await setup(ctx);
    const wanted = role.trim().slice(0, 80);
    if (!wanted) throw new ConvexError("Pick or type a title, like Founder or Head of Sales.");
    const [p]: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.forAction, { userId, ids: [prospectId] });
    if (!p) throw new ConvexError("Company not found.");
    await spend(ctx, userId, "notes");
    const about = `${p.oneLiner}. ${p.funding ?? (p.batch ? `YC ${p.batch}` : "")}`;
    const out = await findAndWriteTo({ name: p.name, website: p.website, about }, wanted, resumes.map((r) => r.resume), voice);
    if (!out.found || !out.name.trim()) throw new ConvexError(`Couldn't find a ${wanted} at ${p.name}. Try another title, or add someone by hand below.`);
    const existing = p.contacts.find((c) => c.name.toLowerCase() === out.name.trim().toLowerCase());
    const person = {
      id: existing?.id ?? randomUUID(),
      name: out.name.trim(),
      title: out.title || wanted,
      linkedinUrl: out.linkedinUrl || existing?.linkedinUrl || "",
      email: existing?.email ?? "",
      phone: existing?.phone ?? "",
      profileText: existing?.profileText,
      commonGround: out.commonGround,
      note: out.note,
      emailSubject: out.emailSubject,
      email2: out.email,
    };
    await ctx.runMutation(internal.prospects.upsertContactForAction, { userId, prospectId, contact: person });
    return `Found ${person.name}, ${person.title}. Note and email are below.`;
  },
});

// ---------- Chat ----------

/** Writes the assistant's reply to the latest message, streaming it into the chat as it goes. */
export const chatReply = internalAction({
  args: { userId: v.id("users"), chatId: v.id("chats") },
  handler: async (ctx, { userId, chatId }) => {
    let text = "";
    // Writes go one after another, so a slow early write can't land after the final one.
    let writes = Promise.resolve<null>(null);
    try {
      await spend(ctx, userId, "chat");
      const me = await contextFor(ctx, userId);
      const chat: Doc<"chats"> = await ctx.runQuery(internal.chats.forAction, { userId, chatId });
      const jobs: Doc<"jobs">[] = await ctx.runQuery(internal.jobs.recentForChat, { userId });
      const prospects: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.topForChat, { userId });
      const focus = chat.jobId ? await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId: chat.jobId })) as Doc<"jobs">) : null;
      const history = chat.messages.slice(0, -1).slice(-30);
      // The conversation sent to Claude has to start with the user.
      while (history.length && history[0].role !== "user") history.shift();
      const userText = chat.messages.filter((m) => m.role === "user").map((m) => m.text).join("\n");
      let lastWrite = 0;
      text = await streamChat({
        system: chatSystemPrompt({ ...me, jobs, prospects, focus }),
        messages: history,
        tools: CHAT_TOOLS,
        runTool: (name, input) => runChatTool(ctx, me, name, input, userText),
        onText: (soFar) => {
          text = soFar;
          // Write about three times a second; the page shows each write as it lands.
          if (Date.now() - lastWrite > 350) {
            lastWrite = Date.now();
            writes = writes.then(() => ctx.runMutation(internal.chats.writeReply, { chatId, text: soFar, done: false }));
          }
        },
      });
      await writes;
      await ctx.runMutation(internal.chats.writeReply, { chatId, text: text || "(No reply. Try again.)", done: true });
    } catch (err) {
      await writes.catch(() => null);
      const reason = err instanceof ConvexError ? String(err.data) : "Something went wrong. Try again.";
      await ctx.runMutation(internal.chats.writeReply, { chatId, text: text ? `${text}\n\n(${reason})` : reason, done: true });
    }
    return null;
  },
});

// ---------- Dream 20 and open roles ----------

const GTM_TITLE = /\b(sales|gtm|go[- ]to[- ]market|business development|bdr|sdr|account (executive|manager|director)|revenue|partnerships?|growth|customer success|solutions? (engineer|consultant)|commercial)\b/i;

/** Looks up a company's open sales and GTM roles in India or remote, saves them as jobs, and returns how many there are. */
async function checkCompanyRoles(ctx: ActionCtx, me: Context, p: Doc<"prospects">): Promise<number> {
  // Bengaluru, or remote and open to India.
  const fitsPlace = (l: { title: string; location?: string | null; workSetting?: string | null }) =>
    GTM_TITLE.test(l.title) && (inBengaluru(l.location ?? "") || remoteForIndia(l.location ?? "", l.workSetting) || /\b(india|bengaluru|bangalore|saarc)\b/i.test(l.title));
  const active = me.tracks.filter((t) => t.status === "active");
  const trackFor = (title: string) => (active.find((t) => t.titles.some((x) => titleMatches(x, title))) ?? active[0])?.key ?? "";
  // Companies whose careers board we read come from there; the rest from Dreamwork.
  const board: string | null = await ctx.runQuery(internal.careers.boardByKey, { key: p.key });
  if (board) {
    const rows: CareerRow[] = await ctx.runQuery(internal.careers.forCompany, { company: board });
    const found = await withCareerTexts(ctx, rows.filter(fitsPlace).slice(0, 100));
    if (found.length) await ctx.runMutation(internal.jobs.insertMany, { userId: me.userId, jobs: found.map((f) => fromFound(f, trackFor(f.title))) });
    return found.length;
  }
  const fits = (await companyListings(p.name)).filter(fitsPlace);
  if (!fits.length) return 0;
  await ctx.runMutation(internal.jobs.insertMany, { userId: me.userId, jobs: fits.map((l) => fromListing(l, trackFor(l.title))) });
  return fits.length;
}

export const checkOpenRoles = action({
  args: { prospectId: v.optional(v.id("prospects")) },
  handler: async (ctx, { prospectId }): Promise<{ companies: number; roles: number }> => {
    const me = await setup(ctx);
    const list: Doc<"prospects">[] = prospectId
      ? await ctx.runQuery(internal.prospects.forAction, { userId: me.userId, ids: [prospectId] })
      : await ctx.runQuery(internal.prospects.dreamsForAction, { userId: me.userId });
    let roles = 0;
    for (const p of list) {
      try {
        const n = await checkCompanyRoles(ctx, me, p);
        roles += n;
        await ctx.runMutation(internal.prospects.recordRoles, { userId: me.userId, prospectId: p._id, openRoles: n });
      } catch (err) {
        console.warn("Role check failed", p.name, String(err));
        // Checking one company: say it failed rather than "no roles".
        if (prospectId) throw err instanceof ConvexError ? err : new ConvexError(`Couldn't check ${p.name} just now. Try again in a minute.`);
      }
    }
    return { companies: list.length, roles };
  },
});

export const suggestDreams = action({
  args: { mustInclude: v.array(v.string()), count: v.optional(v.number()) },
  handler: async (ctx, { mustInclude, count = 20 }): Promise<{ added: number }> => {
    const me = await setup(ctx);
    if (!me.resumes.length) throw new ConvexError("Upload your CV first.");
    await spend(ctx, me.userId, "research");
    const have: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.dreamsForAction, { userId: me.userId });
    const want = Math.max(1, Math.min(20, count - have.length));
    const picks = mustInclude.map((n) => n.trim()).filter(Boolean).slice(0, 20);
    const found = await suggestDreamCompanies(me.resumes.map((r) => r.resume), me.tracks.map((t) => t.name), picks, have.map((h) => h.name), want);
    let added = 0;
    for (const c of found) {
      const id: Id<"prospects"> = await ctx.runMutation(internal.prospects.addDreamForAction, { userId: me.userId, name: c.name });
      await ctx.runMutation(internal.prospects.recordRoles, {
        userId: me.userId,
        prospectId: id,
        openRoles: 0,
        details: { website: c.website, oneLiner: c.oneLiner, industry: c.industry, location: c.location, whyDream: c.whyDream },
      });
      added++;
    }
    // Check the new list for openings straight away.
    const dreams: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.dreamsForAction, { userId: me.userId });
    for (const p of dreams.filter((d) => !d.rolesCheckedAt)) {
      try {
        await ctx.runMutation(internal.prospects.recordRoles, { userId: me.userId, prospectId: p._id, openRoles: await checkCompanyRoles(ctx, me, p) });
      } catch (err) {
        console.warn("Role check failed", p.name, String(err));
      }
    }
    return { added };
  },
});

// ---------- Logos on CVs ----------

/** Fills in each employer's and school's website on all your CVs, so they show logos. */
export const findLogos = action({
  args: {},
  handler: async (ctx): Promise<{ found: number }> => {
    const { userId, resumes } = await setup(ctx);
    const names = [...new Set(resumes.flatMap((r) => [...r.resume.experience.map((e) => e.company), ...r.resume.education.map((e) => e.school)]))].filter(Boolean);
    if (!names.length) return { found: 0 };
    await spend(ctx, userId, "research");
    const domains = await findDomains(names.slice(0, 60));
    for (const r of resumes) {
      const resume = {
        ...r.resume,
        experience: r.resume.experience.map((e) => ({ ...e, domain: e.domain || domains.get(e.company) })),
        education: r.resume.education.map((e) => ({ ...e, domain: e.domain || domains.get(e.school) })),
      };
      await ctx.runMutation(internal.users.saveResumeForAction, { userId, resumeId: r._id, resume });
    }
    return { found: domains.size };
  },
});

// ---------- Chat tools: what the assistant can do in the app ----------

const tool = (name: string, description: string, properties: Record<string, unknown>): Anthropic.Beta.BetaTool => ({
  name,
  description,
  strict: true,
  input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});
const jobIdProp = { type: "string", description: "The job's id, from the [id ...] in the job list." };

const CHAT_TOOLS: Anthropic.Beta.BetaTool[] = [
  tool("add_job", "Save a job to the candidate's list from a link or pasted job description.", {
    link: { type: ["string", "null"], description: "Job post URL, or null." },
    text: { type: ["string", "null"], description: "Pasted job description, or null." },
  }),
  tool("find_jobs", "Search the job boards for new jobs for one role, or every active role.", {
    role_key: { type: ["string", "null"], description: "A role's key from the roles list, or null for all roles." },
  }),
  tool("score_jobs", "Score up to 12 saved jobs for fit against the candidate's roles and CVs.", { job_ids: { type: "array", items: { type: "string" } } }),
  tool("write_application", "Write the tailored CV, cover letter, LinkedIn note and email for a saved job. Takes about a minute.", {
    job_id: jobIdProp,
    notes: { type: ["string", "null"], description: "What the candidate wants changed from the last version, or null." },
    anyway: {
      type: "boolean",
      description: "False at first. True only after you told the candidate the app says to skip this job (closed, a blocker, or a fit under 60) and they said to write it anyway.",
    },
  }),
  tool("set_job_status", "Move a job along: new, applying, applied, screening, interview, offer, rejected, or dismissed (not for me).", {
    job_id: jobIdProp,
    status: { type: "string", enum: ["new", "applying", "applied", "screening", "interview", "offer", "rejected", "dismissed"] },
  }),
  tool("research_company", "Research the company behind a saved job on the web: size, funding, news, India presence.", { job_id: jobIdProp }),
  tool("prepare_interview", "Write interview prep for a saved job: likely questions, stories, questions to ask, 90-day plan.", { job_id: jobIdProp }),
  tool("add_dream_company", "Add a company to the candidate's Dream 20 list, which is watched for openings.", { name: { type: "string" } }),
  tool("save_answer", "Save or update one of the candidate's standard application-form answers.", {
    question: { type: "string" },
    answer: { type: "string" },
  }),
];

/** Runs one chat tool for the signed-in person and returns a one-line result. */
async function runChatTool(ctx: ActionCtx, me: Context, name: string, input: Record<string, unknown>, userText: string): Promise<string> {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const jobId = str("job_id") as Id<"jobs"> | undefined;
  const titleOf = async (id: Id<"jobs">) => {
    const j: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId: me.userId, jobId: id });
    return `${j.title} at ${j.company}`;
  };
  switch (name) {
    case "add_job": {
      // A link has to come from the candidate, not from a job post or web page the assistant read.
      const link = str("link");
      if (link && !userText.includes(link)) return "Not added: I can only add links you pasted in this chat. Paste the link and ask again.";
      const id = await addJobFor(ctx, me.userId, { link: str("link"), text: str("text") });
      return `Added ${await titleOf(id)} to your jobs [id ${id}].`;
    }
    case "find_jobs": {
      const active = me.tracks.filter((t) => t.status === "active" && (!str("role_key") || t.key === str("role_key")));
      await spend(ctx, me.userId, "search", Math.max(1, active.length));
      let added = 0;
      for (const t of active) added += await searchTrack(ctx, me.userId, t, me.location);
      // Name the new unscored jobs, so the assistant can score them next.
      const fresh: Id<"jobs">[] = added ? await ctx.runQuery(internal.jobs.unscoredIds, { userId: me.userId, limit: Math.min(added, 12) }) : [];
      return `Searched ${active.map((t) => t.name).join(", ")}: ${added} new ${added === 1 ? "job" : "jobs"}${fresh.length ? ` (unscored ids: ${fresh.join(", ")})` : ""}.`;
    }
    case "score_jobs": {
      const ids = ((input.job_ids as string[]) ?? []).slice(0, 12) as Id<"jobs">[];
      await spend(ctx, me.userId, "score", ids.length);
      const { scored, failed } = await scoreIds(ctx, me, ids);
      return `Scored ${scored} ${scored === 1 ? "job" : "jobs"}${failed ? `, ${failed} failed` : ""}.`;
    }
    case "write_application": {
      await tailorFor(ctx, me, { jobId: jobId!, feedback: str("notes"), anyway: input.anyway === true });
      return `Wrote the CV, cover letter, LinkedIn note and email for ${await titleOf(jobId!)}. Open it from the job's page.`;
    }
    case "set_job_status": {
      const status = str("status") as Doc<"jobs">["status"];
      const j: { title: string; company: string } = await ctx.runMutation(internal.jobs.setStatusForAction, { userId: me.userId, jobId: jobId!, status });
      return `Moved ${j.title} at ${j.company} to ${status === "dismissed" ? "Not for me" : status}.`;
    }
    case "research_company": {
      await researchFor(ctx, me.userId, jobId!);
      return `Researched the company for ${await titleOf(jobId!)}; it's on the job's page.`;
    }
    case "prepare_interview": {
      await prepFor(ctx, me, jobId!);
      return `Interview prep for ${await titleOf(jobId!)} is on the job's page.`;
    }
    case "add_dream_company": {
      await ctx.runMutation(internal.prospects.addDreamForAction, { userId: me.userId, name: str("name") ?? "" });
      return `Added ${str("name")} to your Dream 20.`;
    }
    case "save_answer": {
      await ctx.runMutation(internal.users.saveAnswerForAction, { userId: me.userId, question: str("question") ?? "", answer: str("answer") ?? "" });
      return `Saved your answer to "${str("question")}".`;
    }
  }
  throw new ConvexError(`I don't have a tool called ${name}.`);
}

export const similarTitles = action({
  args: { trackKey: v.string() },
  handler: async (ctx, { trackKey }): Promise<{ title: string; why: string }[]> => {
    const me = await setup(ctx);
    const track = me.tracks.find((t) => t.key === trackKey);
    if (!track) throw new ConvexError("Save this role first.");
    const cv = requireResume(me.resumeFor[track.key] ?? me.resume);
    await spend(ctx, me.userId, "research");
    return await suggestTitles(track, cv, me.location);
  },
});

export const draftAnswers = action({
  args: { questions: v.array(v.string()) },
  handler: async (ctx, { questions }): Promise<{ question: string; answer: string }[]> => {
    const me = await setup(ctx);
    const cv = requireResume(me.resume);
    if (!questions.length) return [];
    await spend(ctx, me.userId, "notes");
    return await draftFormAnswers(questions.slice(0, 50), cv, me.markets, me.location, me.voice);
  },
});
