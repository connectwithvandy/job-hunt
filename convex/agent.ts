"use node";

import { randomUUID } from "node:crypto";
import { ConvexError, v, type Infer } from "convex/values";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { buildPack, draftReferralNotes, extractJob, parseResume, scoreJob } from "./lib/brain";
import { companyListings, dreamworkIdFromUrl, getListing, searchListings, type Listing } from "./lib/dreamwork";
import type { jobV, resumeV } from "./lib/validators";

type NewJob = Infer<typeof jobV>;
type Resume = Infer<typeof resumeV>;
type Context = { userId: Id<"users">; email: string; resume: Resume | null; resumeFor: Record<string, Resume | null>; location: string; tracks: Doc<"tracks">[] };

async function spend(ctx: ActionCtx, userId: Id<"users">, kind: "readCv" | "score" | "tailor" | "notes" | "addJob", count = 1) {
  await ctx.runMutation(internal.limits.consume, { userId, kind, count });
}

async function setup(ctx: ActionCtx): Promise<Context> {
  const userId = await requireUserId(ctx);
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
  handler: async (ctx, { storageId, fileName, replaceId, label }): Promise<{ roles: number }> => {
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
      await ctx.runMutation(internal.users.storeParsedResume, { userId, resume, replaceId, label });
      return { roles: resume.experience.length };
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
    company: l.company,
    location: l.location,
    workSetting: l.workSetting ?? undefined,
    salary: l.salary ?? undefined,
    postedAt: l.postedAt ?? l.firstSeenAt ?? undefined,
    foundFor: trackKey,
    status: "new",
    outreach: [],
    updatedAt: now,
  };
}

export const findJobs = action({
  args: { trackKey: v.string() },
  handler: async (ctx, { trackKey }): Promise<{ added: number; trackName: string }> => {
    const { userId, tracks, location } = await setup(ctx);
    const track = tracks.find((t) => t.key === trackKey);
    if (!track) throw new ConvexError("Unknown track.");
    const settled = track.company
      ? await Promise.allSettled([companyListings(track.company)])
      : await Promise.allSettled(track.titles.slice(0, 8).map((title) => searchListings(title, location, 8)));
    const listings = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!listings.length && settled.every((r) => r.status === "rejected")) {
      throw new ConvexError("Dreamwork didn't answer. Try again in a minute.");
    }
    const unique = [...new Map(listings.map((l) => [l.id, l])).values()];
    const { added }: { added: number } = await ctx.runMutation(internal.jobs.insertMany, { userId, jobs: unique.map((l) => fromListing(l, track.key)) });
    return { added, trackName: track.name };
  },
});

function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
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
    const { userId, resume, tracks } = await setup(ctx);
    const cv = requireResume(resume);
    const ids = jobIds.slice(0, 12);
    await spend(ctx, userId, "score", ids.length);
    let failed = 0;
    let lastError = "";
    // Four at a time, so twelve jobs take about as long as three.
    for (let i = 0; i < ids.length; i += 4) {
      await Promise.all(
        ids.slice(i, i + 4).map(async (jobId) => {
          try {
            const job = await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
            const s = await scoreJob(job, cv, tracks);
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
    if (failed === ids.length) throw new ConvexError(lastError);
    return { scored: ids.length - failed, failed };
  },
});

// ---------- Applying ----------

export const tailor = action({
  args: { jobId: v.id("jobs"), trackKey: v.string() },
  handler: async (ctx, { jobId, trackKey }): Promise<null> => {
    const { userId, resumeFor, tracks } = await setup(ctx);
    const track = tracks.find((t) => t.key === trackKey);
    if (!track) throw new ConvexError("Unknown track.");
    const cv = requireResume(resumeFor[track.key]);
    await spend(ctx, userId, "tailor");
    const job = await withDescription((await ctx.runQuery(internal.jobs.forAction, { userId, jobId })) as Doc<"jobs">);
    const pack = await buildPack(job, cv, track);
    await ctx.runMutation(internal.jobs.patchForAction, { userId, jobId, description: job.description, pack, trackKey });
    return null;
  },
});

export const draftNotes = action({
  args: { jobId: v.id("jobs"), contactIds: v.array(v.id("contacts")) },
  handler: async (ctx, { jobId, contactIds }): Promise<{ drafted: number }> => {
    const { userId, resumeFor, tracks } = await setup(ctx);
    if (!contactIds.length) throw new ConvexError("Pick at least one person.");
    const job: Doc<"jobs"> = await ctx.runQuery(internal.jobs.forAction, { userId, jobId });
    const best = [...(job.scores ?? [])].sort((a, b) => b.score - a.score)[0]?.trackKey;
    const track = tracks.find((t) => t.key === (job.trackKey ?? best ?? job.foundFor));
    if (!track) throw new ConvexError("Score the job or tailor your CV first, so the note knows which angle to take.");
    const cv = requireResume(resumeFor[track.key]);
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
