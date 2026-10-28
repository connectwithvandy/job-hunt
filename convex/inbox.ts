import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { env, internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { buildDigest, digestDue } from "./lib/digest";
import { jobFor, jobForEvent, nextStatus, stageOf } from "./lib/inbox";
import { freezeSent } from "./jobs";

/** Your private code for the Gmail script, made the first time you ask. */
export const token = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (!profile) return null;
    if (profile.inboxToken) return profile.inboxToken;
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.db.patch("profiles", profile._id, { inboxToken: token });
    return token;
  },
});

const messageV = v.object({ id: v.string(), from: v.string(), subject: v.string(), snippet: v.string(), date: v.string() });

/** Emails from the Gmail script: each one about a job in motion moves that job along. Others are dropped. */
export const ingest = internalMutation({
  args: { token: v.string(), messages: v.array(messageV) },
  handler: async (ctx, { token, messages }) => {
    const profile = await ctx.db.query("profiles").withIndex("by_inboxToken", (q) => q.eq("inboxToken", token)).unique();
    if (!profile) return { ok: false, moved: 0 };
    const userId = profile.userId;
    await ctx.db.patch("profiles", profile._id, { inboxAt: Date.now() });
    const jobs = (await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(500)).filter((j) =>
      ["applying", "applied", "screening", "interview", "offer"].includes(j.status),
    );
    let moved = 0;
    for (const m of messages.slice(0, 100)) {
      const seen = await ctx.db.query("inboxSeen").withIndex("by_userId_and_messageId", (q) => q.eq("userId", userId).eq("messageId", m.id)).first();
      if (seen) continue;
      await ctx.db.insert("inboxSeen", { userId, messageId: m.id });
      const stage = stageOf(m);
      const job = stage && jobFor(m, jobs);
      if (!stage || !job) continue;
      const status = nextStatus(job.status, stage);
      const at = Date.parse(m.date) || Date.now();
      const patch = { lastEmail: { subject: m.subject.slice(0, 200), from: m.from.slice(0, 200), at, stage }, updatedAt: Date.now() };
      await ctx.db.insert("jobEmails", { userId, jobId: job._id, from: m.from.slice(0, 200), subject: m.subject.slice(0, 200), snippet: m.snippet.slice(0, 1500), at, stage });
      await ctx.db.patch("jobs", job._id, status ? { ...patch, status, appliedAt: status === "applied" && !job.appliedAt ? at : job.appliedAt } : patch);
      if (status) {
        await freezeSent(ctx, job, status);
        job.status = status;
        moved++;
      }
    }
    return { ok: true, moved };
  },
});

const eventV = v.object({ id: v.string(), title: v.string(), start: v.string(), end: v.string(), description: v.string(), guests: v.array(v.string()), link: v.string() });

/**
 * Your calendar from yesterday to three weeks ahead, from the Gmail script. Meetings about a job you're
 * pursuing are kept and move that job to interview; the rest are dropped. A kept meeting that's gone was cancelled.
 */
export const calendar = internalMutation({
  args: { token: v.string(), events: v.array(eventV) },
  handler: async (ctx, { token, events }) => {
    const profile = await ctx.db.query("profiles").withIndex("by_inboxToken", (q) => q.eq("inboxToken", token)).unique();
    if (!profile) return { matched: 0 };
    const userId = profile.userId;
    const jobs = (await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(500)).filter((j) =>
      ["applying", "applied", "screening", "interview", "offer"].includes(j.status),
    );
    const kept = new Set<string>();
    for (const e of events.slice(0, 200)) {
      const job = jobForEvent(e, jobs);
      const start = Date.parse(e.start);
      if (!job || !start) continue;
      kept.add(e.id);
      const row = { jobId: job._id, title: e.title.slice(0, 200), start, end: Date.parse(e.end) || start + 3_600_000, link: e.link.slice(0, 500) };
      const old = await ctx.db.query("interviews").withIndex("by_userId_and_eventId", (q) => q.eq("userId", userId).eq("eventId", e.id)).unique();
      if (old) await ctx.db.patch("interviews", old._id, row);
      else await ctx.db.insert("interviews", { userId, eventId: e.id, ...row });
      const status = nextStatus(job.status, "interview");
      if (status) {
        await ctx.db.patch("jobs", job._id, { status, updatedAt: Date.now() });
        await freezeSent(ctx, job, status);
        job.status = status;
      }
    }
    // The script sends everything from yesterday on, so a kept meeting from then on that's missing now was cancelled.
    const from = Date.now() - 86_400_000;
    for (const old of await ctx.db.query("interviews").withIndex("by_userId_and_start", (q) => q.eq("userId", userId).gte("start", from)).take(200)) {
      if (!kept.has(old.eventId)) await ctx.db.delete("interviews", old._id);
    }
    return { matched: kept.size };
  },
});

/** Your interviews from today on, soonest first, with the job each one is for. */
export const upcoming = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const from = new Date().setHours(0, 0, 0, 0);
    const rows = await ctx.db.query("interviews").withIndex("by_userId_and_start", (q) => q.eq("userId", userId).gte("start", from)).take(20);
    return await Promise.all(rows.map(async (r) => ({ ...r, job: await ctx.db.get("jobs", r.jobId) })));
  },
});

/** The morning summary for the Gmail script to email you, once a day from 9:00 in India. Null when not due or nothing to say. */
export const digest = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const profile = await ctx.db.query("profiles").withIndex("by_inboxToken", (q) => q.eq("inboxToken", token)).unique();
    const now = Date.now();
    if (!profile || !digestDue(profile.digestAt, now)) return null;
    const userId = profile.userId;
    const jobs = (await ctx.db.query("jobs").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(500)).filter((j) => j.status !== "dismissed");
    const dreams = await ctx.db.query("prospects").withIndex("by_userId_and_dream", (q) => q.eq("userId", userId).eq("dream", true)).take(80);
    const since = profile.digestAt ?? now - 86_400_000;
    const out = buildDigest({ jobs, dreams, run: profile.lastAutopilot ?? null, since, now, appUrl: (env.APP_URL ?? "https://myjobpipe.vercel.app").replace(/\/$/, "") });
    // Marked even when there's nothing to say, so a quiet day isn't re-checked every hour.
    await ctx.db.patch("profiles", profile._id, { digestAt: now });
    return out;
  },
});
