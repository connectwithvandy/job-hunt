"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildPack, draftReferralNotes, extractJob, scoreJob } from "@/lib/brain";
import { parseConnectionsCsv } from "@/lib/contacts";
import { dreamworkIdFromUrl, getListing, searchListings } from "@/lib/dreamwork";
import {
  getContacts, getJob, getJobs, getResume, getTracks,
  saveContacts, saveJobs, saveResume, saveTracks, updateJob,
} from "@/lib/store";
import type { Job, JobStatus, OutreachStatus, Resume, Track } from "@/lib/types";

export type ActionState = { error?: string; message?: string } | null;

function done(message: string): ActionState {
  revalidatePath("/", "layout");
  return { message };
}

function failed(err: unknown): ActionState {
  return { error: err instanceof Error ? err.message : String(err) };
}

async function requireResume() {
  const resume = await getResume();
  if (!resume) throw new Error("Add your master CV first (Resume page).");
  return resume;
}

// ---------- Finding jobs ----------

export async function findJobs(trackId: string, location: string): Promise<ActionState> {
  try {
    const track = (await getTracks()).find((t) => t.id === trackId);
    if (!track) throw new Error("Unknown track");
    const jobs = await getJobs();
    const seen = new Set(jobs.map((j) => j.id));
    const now = new Date().toISOString();
    let added = 0;
    for (const title of track.titles.slice(0, 4)) {
      for (const l of await searchListings(title, location || "India", 8)) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        added++;
        jobs.push({
          id: l.id,
          source: "dreamwork",
          url: l.url,
          sourceUrl: l.sourceUrl,
          title: l.title,
          company: l.company,
          location: l.location,
          workSetting: l.workSetting,
          salary: l.salary ?? undefined,
          postedAt: l.postedAt ?? l.firstSeenAt,
          addedAt: now,
          foundFor: track.id,
          status: "new",
          outreach: [],
          updatedAt: now,
        });
      }
    }
    await saveJobs(jobs);
    return done(added ? `Found ${added} new ${added === 1 ? "job" : "jobs"} for ${track.name}. Score them to see which fit.` : "No new jobs since last time.");
  } catch (err) {
    return failed(err);
  }
}

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

export async function addJob(_: ActionState, form: FormData): Promise<ActionState> {
  const link = String(form.get("link") ?? "").trim();
  const pasted = String(form.get("text") ?? "").trim();
  let id: string;
  try {
    if (!link && !pasted) throw new Error("Paste a job link, or the job description.");
    const now = new Date().toISOString();
    const jobs = await getJobs();
    const dwId = link ? dreamworkIdFromUrl(link) : null;
    if (dwId && jobs.some((j) => j.id === dwId)) return { message: "That job is already in your list." };

    let job: Job;
    if (dwId) {
      const l = await getListing(dwId);
      const raw = l as unknown as Record<string, string>;
      job = {
        id: dwId, source: "dreamwork", url: link, sourceUrl: l.sourceUrl,
        title: raw.title, company: raw.companyName, location: raw.location,
        workSetting: raw.remoteType, description: l.description, companyLogo: l.companyLogoUrl,
        seniority: l.seniorityLevel, addedAt: now, status: "new", outreach: [], updatedAt: now,
      };
    } else {
      let text = pasted;
      if (!text) {
        const res = await fetch(link, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) job-hunt" }, redirect: "follow" });
        text = res.ok ? htmlToText(await res.text()) : "";
        if (text.length < 400) {
          throw new Error("That site didn't let us read the job. Open it, copy the description, and paste it in the box instead.");
        }
      }
      const x = await extractJob(text);
      if (!x.isJobPosting) throw new Error("That doesn't look like a job posting.");
      job = {
        id: randomUUID(), source: link ? "link" : "pasted", url: link, sourceUrl: link || undefined,
        title: x.title, company: x.company, location: x.location, workSetting: x.workSetting,
        description: x.description, addedAt: now, status: "new", outreach: [], updatedAt: now,
      };
    }
    jobs.push(job);
    await saveJobs(jobs);
    id = job.id;
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/", "layout");
  redirect(`/jobs/${id}`);
}

// ---------- Scoring ----------

async function fillDescription(job: Job) {
  if (job.description || job.source !== "dreamwork") return job;
  const l = await getListing(job.id);
  return { ...job, description: l.description, companyLogo: l.companyLogoUrl, seniority: l.seniorityLevel };
}

export async function scoreOne(jobId: string): Promise<ActionState> {
  try {
    const [resume, tracks] = [await requireResume(), await getTracks()];
    let job = await getJob(jobId);
    if (!job) throw new Error("Job not found");
    job = await fillDescription(job);
    const s = await scoreJob(job, resume, tracks);
    await updateJob(jobId, (j) => ({
      ...j,
      description: job.description,
      companyLogo: job.companyLogo,
      seniority: job.seniority,
      scores: s.scores.map((x) => ({ ...x, score: Math.max(0, Math.min(100, Math.round(x.score))) })),
      brief: { whatTheyWant: s.whatTheyWant, watchOuts: s.watchOuts },
    }));
    return done("Scored.");
  } catch (err) {
    return failed(err);
  }
}

export async function scoreBatch(jobIds: string[]): Promise<ActionState> {
  // Claude calls run in parallel, a few at a time, so ten jobs take about as long as three.
  const results: ActionState[] = [];
  for (let i = 0; i < jobIds.length; i += 4) {
    results.push(...(await Promise.all(jobIds.slice(i, i + 4).map(scoreOne))));
  }
  const errors = results.filter((r) => r?.error);
  revalidatePath("/", "layout");
  if (errors.length) return { error: `${errors.length} of ${jobIds.length} failed: ${errors[0]!.error}` };
  return { message: `Scored ${jobIds.length} ${jobIds.length === 1 ? "job" : "jobs"}.` };
}

// ---------- Applying ----------

export async function startApplication(jobId: string, trackId: string): Promise<ActionState> {
  try {
    const resume = await requireResume();
    const track = (await getTracks()).find((t) => t.id === trackId);
    if (!track) throw new Error("Unknown track");
    let job = await getJob(jobId);
    if (!job) throw new Error("Job not found");
    job = await fillDescription(job);
    const pack = await buildPack(job, resume, track);
    await updateJob(jobId, (j) => ({
      ...j,
      description: job.description,
      trackId,
      pack,
      status: j.status === "new" ? "applying" : j.status,
    }));
    return done("Your CV and cover letter are ready.");
  } catch (err) {
    return failed(err);
  }
}

export async function saveCoverLetter(jobId: string, text: string): Promise<ActionState> {
  try {
    await updateJob(jobId, (j) => (j.pack ? { ...j, pack: { ...j.pack, coverLetter: text } } : j));
    return done("Saved.");
  } catch (err) {
    return failed(err);
  }
}

export async function setJobStatus(jobId: string, status: JobStatus): Promise<ActionState> {
  try {
    await updateJob(jobId, (j) => ({
      ...j,
      status,
      appliedAt: status === "applied" && !j.appliedAt ? new Date().toISOString() : j.appliedAt,
    }));
    return done("Updated.");
  } catch (err) {
    return failed(err);
  }
}

// ---------- Referrals ----------

export async function draftNotes(jobId: string, contactIds: string[]): Promise<ActionState> {
  try {
    if (!contactIds.length) throw new Error("Pick at least one person.");
    const resume = await requireResume();
    const job = await getJob(jobId);
    if (!job) throw new Error("Job not found");
    const track = (await getTracks()).find((t) => t.id === (job.trackId ?? job.foundFor));
    if (!track) throw new Error("Choose a track for this job first.");
    const people = (await getContacts()).filter((c) => contactIds.includes(c.id));
    const notes = await draftReferralNotes(job, resume, track, people);
    await updateJob(jobId, (j) => {
      const outreach = [...j.outreach];
      for (const n of notes) {
        const p = people.find((c) => c.id === n.contactId);
        if (!p) continue;
        const entry = {
          contactId: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position,
          url: p.url, message: n.message, status: "draft" as const,
        };
        const i = outreach.findIndex((o) => o.contactId === p.id);
        if (i === -1) outreach.push(entry);
        else outreach[i] = { ...outreach[i], message: n.message };
      }
      return { ...j, outreach };
    });
    return done(`Drafted ${notes.length} ${notes.length === 1 ? "note" : "notes"}.`);
  } catch (err) {
    return failed(err);
  }
}

export async function setOutreach(jobId: string, contactId: string, status: OutreachStatus, message?: string): Promise<ActionState> {
  try {
    await updateJob(jobId, (j) => ({
      ...j,
      outreach: j.outreach.map((o) =>
        o.contactId === contactId
          ? {
              ...o,
              status,
              message: message ?? o.message,
              sentAt: status === "sent" && !o.sentAt ? new Date().toISOString() : o.sentAt,
            }
          : o,
      ),
    }));
    return done("Updated.");
  } catch (err) {
    return failed(err);
  }
}

export async function importConnections(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose your Connections.csv file.");
    const contacts = parseConnectionsCsv(await file.text());
    await saveContacts(contacts);
    return done(`Loaded ${contacts.length.toLocaleString()} connections.`);
  } catch (err) {
    return failed(err);
  }
}

// ---------- Tracks & CV ----------

export async function saveTrack(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const tracks = await getTracks();
    const id = String(form.get("id"));
    const next: Track = {
      id,
      name: String(form.get("name")).trim(),
      color: String(form.get("color")),
      status: form.get("active") ? "active" : "paused",
      titles: String(form.get("titles")).split(/\n|,/).map((s) => s.trim()).filter(Boolean),
      pitch: String(form.get("pitch")).trim(),
    };
    if (!next.name || !next.titles.length) throw new Error("A track needs a name and at least one title.");
    const i = tracks.findIndex((t) => t.id === id);
    if (i === -1) tracks.push(next);
    else tracks[i] = next;
    await saveTracks(tracks);
    return done("Saved.");
  } catch (err) {
    return failed(err);
  }
}

export async function saveResumeJson(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const resume = JSON.parse(String(form.get("json"))) as Resume;
    if (!resume.name || !Array.isArray(resume.experience)) throw new Error("The CV needs at least a name and an experience list.");
    await saveResume(resume);
    return done("CV saved.");
  } catch (err) {
    return failed(err instanceof SyntaxError ? new Error(`That isn't valid JSON: ${err.message}`) : err);
  }
}
