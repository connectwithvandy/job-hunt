import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import type { Contact, Job, Resume, Track } from "./types";
import { DEFAULT_TRACKS } from "./defaults";

// Everything personal lives as plain JSON in one folder, so it can be backed up
// to a private git repo and moved to a new laptop with one clone.
export const DATA_DIR = process.env.JOBHUNT_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  await connection();
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJSON(file: string, value: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const target = path.join(DATA_DIR, file);
  // Write then rename, so a crash mid-write never leaves a half file behind.
  await fs.writeFile(target + ".tmp", JSON.stringify(value, null, 2) + "\n");
  await fs.rename(target + ".tmp", target);
}

export const getTracks = () => readJSON<Track[]>("tracks.json", DEFAULT_TRACKS);
export const saveTracks = (tracks: Track[]) => writeJSON("tracks.json", tracks);

export const getResume = () => readJSON<Resume | null>("resume.json", null);
export const saveResume = (resume: Resume) => writeJSON("resume.json", resume);

export const getJobs = () => readJSON<Job[]>("jobs.json", []);
export const saveJobs = (jobs: Job[]) => writeJSON("jobs.json", jobs);

export async function getJob(id: string) {
  return (await getJobs()).find((j) => j.id === id) ?? null;
}

export async function updateJob(id: string, change: (job: Job) => Job) {
  const jobs = await getJobs();
  const i = jobs.findIndex((j) => j.id === id);
  if (i === -1) throw new Error(`No job with id ${id}`);
  jobs[i] = { ...change(jobs[i]), updatedAt: new Date().toISOString() };
  await saveJobs(jobs);
  return jobs[i];
}

export const getContacts = () => readJSON<Contact[]>("contacts.json", []);
export const saveContacts = (contacts: Contact[]) => writeJSON("contacts.json", contacts);
