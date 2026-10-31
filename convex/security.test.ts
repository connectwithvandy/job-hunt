/// <reference types="vite/client" />
// Before strangers join as beta testers: one person can never see or change another's data,
// the waitlist really keeps unapproved people out, and owner-only pages stay owner-only.
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const OWNER = "owner@example.com";

const resume = {
  name: "Person",
  headline: "Sales leader",
  summary: "Leads teams.",
  contact: { phone: "", email: "", location: "Bengaluru", linkedin: "" },
  experience: [],
  education: [],
  certifications: [],
  skills: { technical: [], soft: [] },
  extras: [],
};

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

/** A signed-in person. `approved` adds a waitlist row; owners need none. */
async function person(t: T, email: string, approved: boolean | null) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { email });
    if (approved !== null) await ctx.db.insert("access", { userId: id, email, approved });
    return id;
  });
  // @convex-dev/auth reads the user id from the token subject, "userId|sessionId".
  return { userId, as: t.withIdentity({ subject: `${userId}|session-${email}` }) };
}

/** One of each private thing, all belonging to `userId`. */
async function seed(t: T, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", {
      userId,
      externalId: `ext-${userId}`,
      source: "pasted",
      url: "https://example.com/job",
      title: "Head of Sales",
      company: "Acme",
      location: "Bengaluru",
      status: "new",
      outreach: [],
      updatedAt: now,
    });
    await ctx.db.insert("profiles", { userId, location: "Bengaluru", onboarded: true });
    const resumeId = await ctx.db.insert("resumes", { userId, label: "Main CV", resume });
    const resume2Id = await ctx.db.insert("resumes", { userId, label: "Second CV", resume });
    const storyId = await ctx.db.insert("stories", {
      userId,
      title: "Big deal",
      situation: "s",
      action: "a",
      result: "r",
      reflection: "x",
      answers: [],
      unverified: [],
      usedFor: [],
      updatedAt: now,
    });
    const contactId = await ctx.db.insert("contacts", {
      userId,
      linkedinUrl: "https://linkedin.com/in/x",
      firstName: "Ravi",
      lastName: "K",
      company: "Acme",
      companyKey: "acme",
      position: "VP",
      connectedOn: "2024",
    });
    const prospectId = await ctx.db.insert("prospects", {
      userId,
      key: "acme",
      name: "Acme",
      website: "acme.com",
      source: "manual",
      oneLiner: "",
      industry: "",
      location: "",
      status: "new",
      contacts: [],
      updatedAt: now,
    });
    const chatId = await ctx.db.insert("chats", {
      userId,
      title: "Private chat",
      messages: [{ role: "user", text: "my secret", at: now }],
      pending: false,
      updatedAt: now,
    });
    return { jobId, resumeId, resume2Id, storyId, contactId, prospectId, chatId };
  });
}

const story = { title: "Hijacked", situation: "s", action: "a", result: "r", reflection: "x", answers: [] };

beforeEach(() => {
  process.env.OWNER_EMAILS = OWNER;
});

describe("A. one tester can't reach another's data", () => {
  test("B can't read A's job or chat; A can", async () => {
    const t = setup();
    const a = await person(t, "a@example.com", true);
    const b = await person(t, "b@example.com", true);
    const ids = await seed(t, a.userId);

    expect(await b.as.query(api.jobs.get, { jobId: ids.jobId })).toBeNull();
    expect(await b.as.query(api.chats.get, { chatId: ids.chatId })).toBeNull();
    expect(await t.query(api.chats.get, { chatId: ids.chatId })).toBeNull(); // signed out

    expect((await a.as.query(api.jobs.get, { jobId: ids.jobId }))?.job.title).toBe("Head of Sales");
    expect((await a.as.query(api.chats.get, { chatId: ids.chatId }))?.title).toBe("Private chat");
  });

  test("B can't change A's job status", async () => {
    const t = setup();
    const a = await person(t, "a@example.com", true);
    const b = await person(t, "b@example.com", true);
    const { jobId } = await seed(t, a.userId);

    await expect(b.as.mutation(api.jobs.setStatus, { jobId, status: "dismissed" })).rejects.toThrow(/Job not found/);
    expect((await t.run((ctx) => ctx.db.get("jobs", jobId)))?.status).toBe("new");

    await a.as.mutation(api.jobs.setStatus, { jobId, status: "applied" });
    expect((await t.run((ctx) => ctx.db.get("jobs", jobId)))?.status).toBe("applied");
  });

  test("B can't rename or delete A's CV", async () => {
    const t = setup();
    const a = await person(t, "a@example.com", true);
    const b = await person(t, "b@example.com", true);
    const { resumeId, resume2Id } = await seed(t, a.userId);
    await seed(t, b.userId); // B has CVs of their own, so "keep at least one" can't hide a leak

    await expect(b.as.mutation(api.users.renameResume, { resumeId, label: "Pwned" })).rejects.toThrow(/CV not found/);
    await expect(b.as.mutation(api.users.deleteResume, { resumeId })).rejects.toThrow(/CV not found/);
    expect((await t.run((ctx) => ctx.db.get("resumes", resumeId)))?.label).toBe("Main CV");

    await a.as.mutation(api.users.renameResume, { resumeId, label: "Renamed" });
    expect((await t.run((ctx) => ctx.db.get("resumes", resumeId)))?.label).toBe("Renamed");
    await a.as.mutation(api.users.deleteResume, { resumeId: resume2Id });
    expect(await t.run((ctx) => ctx.db.get("resumes", resume2Id))).toBeNull();
  });

  test("B can't edit or delete A's story", async () => {
    const t = setup();
    const a = await person(t, "a@example.com", true);
    const b = await person(t, "b@example.com", true);
    const { storyId } = await seed(t, a.userId);

    await expect(b.as.mutation(api.stories.save, { storyId, story })).rejects.toThrow(/That story is gone/);
    // remove quietly does nothing for someone else's story (no error), so check the row survived.
    await b.as.mutation(api.stories.remove, { storyId });
    expect((await t.run((ctx) => ctx.db.get("stories", storyId)))?.title).toBe("Big deal");

    await a.as.mutation(api.stories.save, { storyId, story: { ...story, title: "Edited" } });
    expect((await t.run((ctx) => ctx.db.get("stories", storyId)))?.title).toBe("Edited");
    await a.as.mutation(api.stories.remove, { storyId });
    expect(await t.run((ctx) => ctx.db.get("stories", storyId))).toBeNull();
  });

  test("B can't change A's contact or prospect", async () => {
    const t = setup();
    const a = await person(t, "a@example.com", true);
    const b = await person(t, "b@example.com", true);
    const { contactId, prospectId } = await seed(t, a.userId);

    await expect(b.as.mutation(api.contacts.markLeft, { contactId })).rejects.toThrow(/Connection not found/);
    await expect(b.as.mutation(api.prospects.setStatus, { prospectId, status: "skip" })).rejects.toThrow(/Company not found/);
    expect((await t.run((ctx) => ctx.db.get("contacts", contactId)))?.left).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get("prospects", prospectId)))?.status).toBe("new");

    await a.as.mutation(api.contacts.markLeft, { contactId });
    await a.as.mutation(api.prospects.setStatus, { prospectId, status: "talking" });
    expect((await t.run((ctx) => ctx.db.get("contacts", contactId)))?.left).toBe(true);
    expect((await t.run((ctx) => ctx.db.get("prospects", prospectId)))?.status).toBe("talking");
  });
});

describe("B. the waitlist keeps unapproved people out", () => {
  test("waiting, never-joined and signed-out people are refused; approved and owner get in", async () => {
    const t = setup();
    const waiting = await person(t, "wait@example.com", false);
    const stranger = await person(t, "stranger@example.com", null);
    const approved = await person(t, "ok@example.com", true);
    const owner = await person(t, OWNER, null);
    const w = await seed(t, waiting.userId);
    const s = await seed(t, stranger.userId);

    // Their own data, so only the waitlist can be what stops them.
    await expect(waiting.as.mutation(api.jobs.setStatus, { jobId: w.jobId, status: "applied" })).rejects.toThrow(/You're on the waitlist/);
    await expect(waiting.as.mutation(api.contacts.markLeft, { contactId: w.contactId })).rejects.toThrow(/You're on the waitlist/);
    await expect(stranger.as.mutation(api.jobs.setStatus, { jobId: s.jobId, status: "applied" })).rejects.toThrow(/You're on the waitlist/);
    await expect(t.mutation(api.jobs.setStatus, { jobId: w.jobId, status: "applied" })).rejects.toThrow(/Please sign in again/);
    expect((await t.run((ctx) => ctx.db.get("jobs", w.jobId)))?.status).toBe("new");

    const ap = await seed(t, approved.userId);
    await approved.as.mutation(api.jobs.setStatus, { jobId: ap.jobId, status: "applied" });
    const ow = await seed(t, owner.userId);
    await owner.as.mutation(api.jobs.setStatus, { jobId: ow.jobId, status: "applied" });
  });

  test("approval by the owner lets a waiting person in; taking it back shuts them out", async () => {
    const t = setup();
    const owner = await person(t, OWNER, null);
    const waiting = await person(t, "wait@example.com", null);
    const { jobId } = await seed(t, waiting.userId);

    await waiting.as.mutation(api.access.join, {});
    await expect(waiting.as.mutation(api.access.setApproved, { accessId: (await t.run((ctx) => ctx.db.query("access").first()))!._id, approved: true })).rejects.toThrow(/Only the owner/);
    await expect(waiting.as.mutation(api.jobs.setStatus, { jobId, status: "applied" })).rejects.toThrow(/You're on the waitlist/);

    const row = await t.run((ctx) => ctx.db.query("access").first());
    await owner.as.mutation(api.access.setApproved, { accessId: row!._id, approved: true });
    await waiting.as.mutation(api.jobs.setStatus, { jobId, status: "applied" });

    await owner.as.mutation(api.access.setApproved, { accessId: row!._id, approved: false });
    await expect(waiting.as.mutation(api.jobs.setStatus, { jobId, status: "screening" })).rejects.toThrow(/You're on the waitlist/);
  });

  test("owner match is exact: a look-alike email isn't the owner", async () => {
    const t = setup();
    const fake = await person(t, "Owner@example.com", null);
    const { jobId } = await seed(t, fake.userId);
    await expect(fake.as.mutation(api.jobs.setStatus, { jobId, status: "applied" })).rejects.toThrow(/You're on the waitlist/);
    await expect(fake.as.query(api.access.list, {})).rejects.toThrow(/Only the owner/);
  });
});

describe("D. owner-only pages", () => {
  test("access.list and feedback.list refuse an approved tester and a signed-out caller, work for the owner", async () => {
    const t = setup();
    const tester = await person(t, "ok@example.com", true);
    const owner = await person(t, OWNER, null);
    await t.run((ctx) => ctx.db.insert("feedback", { userId: tester.userId, email: "ok@example.com", text: "nice", page: "/" }));

    await expect(tester.as.query(api.access.list, {})).rejects.toThrow(/Only the owner/);
    await expect(tester.as.query(api.feedback.list, {})).rejects.toThrow(/Only the owner/);
    await expect(t.query(api.access.list, {})).rejects.toThrow(/Only the owner/);
    await expect(t.query(api.feedback.list, {})).rejects.toThrow(/Only the owner/);

    expect((await owner.as.query(api.access.list, {})).approved).toHaveLength(1);
    expect(await owner.as.query(api.feedback.list, {})).toHaveLength(1);
  });

  test("with OWNER_EMAILS unset, nobody is the owner", async () => {
    delete process.env.OWNER_EMAILS;
    const t = setup();
    const owner = await person(t, OWNER, null);
    await expect(owner.as.query(api.access.list, {})).rejects.toThrow(/Only the owner/);
  });
});
