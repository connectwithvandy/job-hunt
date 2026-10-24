"use node";

import { randomUUID } from "node:crypto";
import { ConvexError, v, type Infer } from "convex/values";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { buildPack, draftReferralNotes, extractJob, findFundedCompanies, interviewPrep, parseResume, personaliseOutreach, researchCompany, scoreJob, scoreProspects } from "./lib/brain";
import { companyKey } from "./lib/company";
import { readPlace } from "./lib/sources";
import { companyListings, dreamworkIdFromUrl, getListing, searchListings, type Listing } from "./lib/dreamwork";
import { htmlToText, searchOtherSources, titleMatches, type Found } from "./lib/sources";
import type { jobV, resumeV } from "./lib/validators";
import { prospectV } from "./lib/validators";

type NewJob = Infer<typeof jobV>;

/** Jobs the morning run scores per person; the rest wait a day. */
const AUTOPILOT_SCORES = 24;
type Resume = Infer<typeof resumeV>;
type Context = {
  userId: Id<"users">;
  email: string;
  resume: Resume | null;
  resumes: { _id: Id<"resumes">; resume: Resume }[];
  resumeFor: Record<string, Resume | null>;
  location: string;
  tracks: Doc<"tracks">[];
};

async function spend(ctx: ActionCtx, userId: Id<"users">, kind: "readCv" | "score" | "tailor" | "notes" | "addJob" | "research" | "prep", count = 1) {
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
    return { added: await searchTrack(ctx, userId, track, location), trackName: track.name };
  },
});

/** Searches every board for one track and saves the new roles. Returns how many were new. */
async function searchTrack(ctx: ActionCtx, userId: Id<"users">, track: Doc<"tracks">, location: string, googleTitles = 2): Promise<number> {
    const [settled, others] = await Promise.all([
      track.company
        ? Promise.allSettled([companyListings(track.company)])
        : Promise.allSettled(track.titles.slice(0, 8).map((title) => searchListings(title, location, 8))),
      track.company ? Promise.resolve([]) : searchOtherSources(track.titles, location, googleTitles),
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
  handler: async (ctx, args): Promise<Id<"jobs">> => {
    const { userId } = await setup(ctx);
    const link = args.link?.trim() ?? "";
    const pasted = args.text?.trim() ?? "";
    if (!link && !pasted) throw new ConvexError("Paste a job link, or the job description.");
    if (link && !/^https?:\/\//i.test(link)) throw new ConvexError("That link should start with https://");
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
        const res = await fetch(link, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) job-hunt" }, redirect: "follow" }).catch(() => null);
        text = res?.ok ? htmlToText(await res.text()) : "";
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
async function scoreIds(ctx: ActionCtx, { userId, resume, resumeFor, tracks }: Context, ids: Id<"jobs">[]) {
    const cv = requireResume(resume);
    const cvFor = (t: { key: string }) => resumeFor[t.key] ?? cv;
    let failed = 0;
    let lastError = "";
    // Four at a time, so twelve jobs take about as long as three.
    for (let i = 0; i < ids.length; i += 4) {
      await Promise.all(
        ids.slice(i, i + 4).map(async (jobId) => {
          try {
            const job = await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
            const s = await scoreJob(job, cvFor, tracks);
            await ctx.runMutation(internal.jobs.patchForAction, {
              userId,
              jobId,
              description: job.description,
              companyLogo: job.companyLogo,
              seniority: job.seniority,
              scores: s.scores.map((x) => ({ trackKey: x.trackId, score: Math.max(0, Math.min(100, Math.round(x.score))), reason: x.reason, gaps: x.gaps })),
              brief: { whatTheyWant: s.whatTheyWant, watchOuts: s.watchOuts },
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
    for (const userId of userIds) {
      try {
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
          try {
            await spend(ctx, userId, "score", unscored.length);
            for (let i = 0; i < unscored.length; i += 12) scored += (await scoreIds(ctx, me, unscored.slice(i, i + 12))).scored;
          } catch (err) {
            // Out of today's allowance: the rest wait for tomorrow.
            console.warn("Autopilot scoring stopped", String(err));
          }
        }
        const strong: number = await ctx.runQuery(internal.jobs.strongSince, { userId, since: Date.now() - 86_400_000 });
        await ctx.runMutation(internal.users.recordAutopilot, { userId, added, scored, strong });
      } catch (err) {
        console.error("Autopilot failed for a user", String(err));
      }
    }
    return null;
  },
});

// ---------- Applying ----------

export const tailor = action({
  args: { jobId: v.id("jobs"), trackKey: v.optional(v.string()), resumeId: v.optional(v.id("resumes")), feedback: v.optional(v.string()) },
  handler: async (ctx, { jobId, trackKey, resumeId, feedback }): Promise<null> => {
    const { userId, resume, resumes, resumeFor, tracks } = await setup(ctx);
    const job = await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
    // No track picked: use the best-scoring one if the job was scored, otherwise pitch straight at the job.
    const best = [...(job.scores ?? [])].sort((a, b) => b.score - a.score)[0]?.trackKey;
    const track = tracks.find((t) => t.key === (trackKey ?? best)) ?? null;
    if (trackKey && !track) throw new ConvexError("Unknown track.");
    const chosen = resumeId ? resumes.find((r) => r._id === resumeId)?.resume : undefined;
    if (resumeId && !chosen) throw new ConvexError("That CV is gone. Pick another.");
    const cv = requireResume(chosen ?? (track ? resumeFor[track.key] : resume));
    await spend(ctx, userId, "tailor");
    const notes = feedback?.trim().slice(0, 2000);
    const pack = await buildPack(job, cv, track, notes ? { notes, previous: job.pack } : undefined);
    await ctx.runMutation(internal.jobs.patchForAction, { userId, jobId, description: job.description, pack, trackKey: track?.key });
    return null;
  },
});

export const draftNotes = action({
  args: { jobId: v.id("jobs"), contactIds: v.array(v.id("contacts")) },
  handler: async (ctx, { jobId, contactIds }): Promise<{ drafted: number }> => {
    const { userId, resume, resumeFor, tracks } = await setup(ctx);
    if (!contactIds.length) throw new ConvexError("Pick at least one person.");
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    const best = [...(job.scores ?? [])].sort((a, b) => b.score - a.score)[0]?.trackKey;
    const track = tracks.find((t) => t.key === (job.trackKey ?? best ?? job.foundFor)) ?? null;
    const cv = requireResume(job.pack?.resume ?? (track ? resumeFor[track.key] : resume));
    const people: Doc<"contacts">[] = await ctx.runQuery(internal.jobs.contactsForAction, { userId, ids: contactIds });
    await spend(ctx, userId, "notes");
    const notes = await draftReferralNotes(job, cv, track, people);
    const outreach = [...job.outreach];
    for (const n of notes) {
      const p = people.find((c) => c._id === n.contactId);
      if (!p) continue;
      const entry = {
        contactId: p._id, name: `${p.firstName} ${p.lastName}`, position: p.position,
        url: p.linkedinUrl, message: n.message, status: "draft" as const,
      };
      const i = outreach.findIndex((o) => o.contactId === p._id);
      if (i === -1) outreach.push(entry);
      else outreach[i] = { ...outreach[i], message: n.message };
    }
    await ctx.runMutation(internal.jobs.patchForAction, { userId, jobId, outreach });
    return { drafted: notes.length };
  },
});

// ---------- Company research and interview prep ----------

export const research = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<null> => {
    const userId = await requireUserId(ctx);
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    await spend(ctx, userId, "research");
    const found = await researchCompany(job);
    await ctx.runMutation(internal.jobs.saveExtras, { userId, jobId, research: { createdAt: Date.now(), ...found } });
    return null;
  },
});

export const prep = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<null> => {
    const { userId, resume, resumeFor, tracks } = await setup(ctx);
    const job = await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
    const track = tracks.find((t) => t.key === (job.trackKey ?? job.pack?.trackKey ?? job.foundFor)) ?? null;
    const cv = requireResume(job.pack?.resume ?? (track ? resumeFor[track.key] : resume));
    await spend(ctx, userId, "prep");
    const out = await interviewPrep(job, cv, track, job.research);
    await ctx.runMutation(internal.jobs.saveExtras, { userId, jobId, prep: { createdAt: Date.now(), ...out } });
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
    const contacts = (job.hiringContacts ?? []).map((c) =>
      c.id === contactId ? { ...c, email: body.data!.email!, phone: c.phone || body.data!.phone_number || "" } : c,
    );
    await ctx.runMutation(internal.jobs.saveContactsForAction, { userId, jobId, contacts });
    return { email: body.data.email, confidence: body.data.score ?? 0 };
  },
});

/** Finds common ground with one contact and rewrites the note and email for them. */
export const personalise = action({
  args: { jobId: v.id("jobs"), contactId: v.string(), profileText: v.optional(v.string()), searchWeb: v.boolean() },
  handler: async (ctx, { jobId, contactId, profileText, searchWeb }): Promise<null> => {
    const { userId, resumes } = await setup(ctx);
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    const person = job.hiringContacts?.find((c) => c.id === contactId);
    if (!person) throw new ConvexError("That person isn't on this job any more.");
    const pasted = profileText?.trim() || person.profileText;
    if (!pasted && !searchWeb) throw new ConvexError("Paste their LinkedIn profile, or tick the web search box.");
    if (!resumes.length) throw new ConvexError("Upload your CV first.");
    await spend(ctx, userId, "notes");
    const out = await personaliseOutreach(job, resumes.map((r) => r.resume), { ...person, profileText: pasted }, searchWeb);
    const contacts = (job.hiringContacts ?? []).map((c) =>
      c.id === contactId ? { ...c, profileText: pasted, commonGround: out.commonGround, note: out.note, emailSubject: out.emailSubject, email2: out.email } : c,
    );
    await ctx.runMutation(internal.jobs.saveContactsForAction, { userId, jobId, contacts });
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
async function ycCandidates(location: string, skip: Set<string>, limit: number): Promise<NewProspect[]> {
  const res = await fetch("https://yc-oss.github.io/api/companies/all.json", { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new ConvexError("The YC directory didn't answer. Try again in a minute.");
  const all = (await res.json()) as YcCompany[];
  const place = readPlace(location);
  const year = (b: string) => Number(b.match(/\d{4}/)?.[0] ?? 0);
  const where = (c: YcCompany) => {
    const text = `${c.regions.join(" ")} ${c.all_locations}`.toLowerCase();
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

export const findYcCompanies = action({
  args: {},
  handler: async (ctx): Promise<{ added: number }> => {
    const me = await setup(ctx);
    if (!me.resumes.length) throw new ConvexError("Upload your CV first.");
    const skip = new Set<string>(await ctx.runQuery(internal.prospects.keysForAction, { userId: me.userId }));
    const found = await ycCandidates(me.location, skip, 30);
    const ids: Id<"prospects">[] = await ctx.runMutation(internal.prospects.insertMany, { userId: me.userId, prospects: found });
    if (ids.length) {
      await spend(ctx, me.userId, "score", Math.ceil(ids.length / 15));
      await fitProspects(ctx, me, ids);
    }
    return { added: ids.length };
  },
});

export const findFunded = action({
  args: {},
  handler: async (ctx): Promise<{ added: number }> => {
    const me = await setup(ctx);
    if (!me.resumes.length) throw new ConvexError("Upload your CV first.");
    await spend(ctx, me.userId, "research");
    const skip: string[] = await ctx.runQuery(internal.prospects.keysForAction, { userId: me.userId });
    const found = await findFundedCompanies(me.location, me.tracks.filter((t) => t.status === "active").map((t) => t.name), skip);
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
    return { added: ids.length };
  },
});

/** Common ground and an early-approach note for one person at a company with no posted role. */
export const personaliseProspect = action({
  args: { prospectId: v.id("prospects"), contactId: v.string(), profileText: v.optional(v.string()), searchWeb: v.boolean() },
  handler: async (ctx, { prospectId, contactId, profileText, searchWeb }): Promise<null> => {
    const { userId, resumes } = await setup(ctx);
    const [p]: Doc<"prospects">[] = await ctx.runQuery(internal.prospects.forAction, { userId, ids: [prospectId] });
    if (!p) throw new ConvexError("Company not found.");
    const person = p.contacts.find((c) => c.id === contactId);
    if (!person) throw new ConvexError("That person isn't on this company any more.");
    const pasted = profileText?.trim() || person.profileText;
    if (!pasted && !searchWeb) throw new ConvexError("Paste their LinkedIn profile, or tick the web search box.");
    await spend(ctx, userId, "notes");
    const asJob = { title: "(no role posted)", company: p.name, location: p.location, description: `${p.oneLiner}. ${p.funding ?? (p.batch ? `YC ${p.batch}` : "")}`, url: p.website };
    const out = await personaliseOutreach(asJob, resumes.map((r) => r.resume), { ...person, profileText: pasted }, searchWeb, true);
    const contacts = p.contacts.map((c) =>
      c.id === contactId ? { ...c, profileText: pasted, commonGround: out.commonGround, note: out.note, emailSubject: out.emailSubject, email2: out.email } : c,
    );
    await ctx.runMutation(internal.prospects.patchForAction, { userId, prospectId, contacts });
    return null;
  },
});
