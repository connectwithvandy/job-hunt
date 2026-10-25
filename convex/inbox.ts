import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { jobFor, nextStatus, stageOf } from "./lib/inbox";

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
      await ctx.db.patch("jobs", job._id, status ? { ...patch, status, appliedAt: status === "applied" && !job.appliedAt ? at : job.appliedAt } : patch);
      if (status) {
        job.status = status;
        moved++;
      }
    }
    return { ok: true, moved };
  },
});
