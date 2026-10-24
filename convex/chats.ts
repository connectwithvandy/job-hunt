import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

const MAX_MESSAGES = 120;
const STUCK_AFTER = 10 * 60_000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const chats = await ctx.db.query("chats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId)).order("desc").take(50);
    return chats.map((c) => ({ _id: c._id, title: c.title, updatedAt: c.updatedAt, jobId: c.jobId }));
  },
});

export const get = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get("chats", chatId);
    if (!userId || !chat || chat.userId !== userId) return null;
    return chat;
  },
});

/** The reply being written right now, if any. Changes several times a second while the assistant writes. */
export const draft = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.query("chatDrafts").withIndex("by_chatId", (q) => q.eq("chatId", chatId)).unique();
    return row && row.userId === userId ? row.text : null;
  },
});

/** Adds your message and starts the assistant's reply. Creates the chat on the first message. */
export const send = mutation({
  args: { chatId: v.optional(v.id("chats")), text: v.string(), jobId: v.optional(v.id("jobs")) },
  handler: async (ctx, { chatId, text, jobId }) => {
    const userId = await requireUserId(ctx);
    const body = text.trim();
    if (!body) throw new ConvexError("Type a message first.");
    if (body.length > 8000) throw new ConvexError("That message is too long. Keep it under 8,000 characters.");
    const now = Date.now();
    const turn = [
      { role: "user" as const, text: body, at: now },
      { role: "assistant" as const, text: "", at: now },
    ];
    let id = chatId;
    if (id) {
      const chat = await ctx.db.get("chats", id);
      if (!chat || chat.userId !== userId) throw new ConvexError("Chat not found.");
      // A reply that hasn't written anything for 10 minutes died; let the next message through.
      const draft = await ctx.db.query("chatDrafts").withIndex("by_chatId", (q) => q.eq("chatId", chat._id)).unique();
      if (chat.pending && now - (draft?.at ?? chat.updatedAt) < STUCK_AFTER) throw new ConvexError("Wait for the reply to finish first.");
      if (draft) await ctx.db.delete("chatDrafts", draft._id);
      if (chat.messages.length + 2 > MAX_MESSAGES) throw new ConvexError("This chat is full. Start a new one.");
      await ctx.db.patch("chats", id, { messages: [...chat.messages, ...turn], pending: true, updatedAt: now });
    } else {
      if (jobId) {
        const job = await ctx.db.get("jobs", jobId);
        if (!job || job.userId !== userId) throw new ConvexError("Job not found.");
      }
      id = await ctx.db.insert("chats", { userId, title: body.slice(0, 60), jobId, messages: turn, pending: true, updatedAt: now });
    }
    await ctx.scheduler.runAfter(0, internal.agent.chatReply, { userId, chatId: id });
    return id;
  },
});

export const remove = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const userId = await requireUserId(ctx);
    const chat = await ctx.db.get("chats", chatId);
    if (!chat || chat.userId !== userId) throw new ConvexError("Chat not found.");
    for (const d of await ctx.db.query("chatDrafts").withIndex("by_chatId", (q) => q.eq("chatId", chatId)).take(5)) await ctx.db.delete("chatDrafts", d._id);
    await ctx.db.delete("chats", chatId);
    return null;
  },
});

export const forAction = internalQuery({
  args: { userId: v.id("users"), chatId: v.id("chats") },
  handler: async (ctx, { userId, chatId }) => {
    const chat = await ctx.db.get("chats", chatId);
    if (!chat || chat.userId !== userId) throw new ConvexError("Chat not found.");
    return chat;
  },
});

/** Writes the reply so far to the draft; `done` moves it into the chat and ends the turn. */
export const writeReply = internalMutation({
  args: { chatId: v.id("chats"), text: v.string(), done: v.boolean() },
  handler: async (ctx, { chatId, text, done }) => {
    const chat = await ctx.db.get("chats", chatId);
    if (!chat) return null;
    const draft = await ctx.db.query("chatDrafts").withIndex("by_chatId", (q) => q.eq("chatId", chatId)).unique();
    if (!done) {
      if (draft) await ctx.db.patch("chatDrafts", draft._id, { text, at: Date.now() });
      else await ctx.db.insert("chatDrafts", { chatId, userId: chat.userId, text, at: Date.now() });
      return null;
    }
    const messages = [...chat.messages];
    messages[messages.length - 1] = { ...messages[messages.length - 1], text };
    await ctx.db.patch("chats", chatId, { messages, pending: false, updatedAt: Date.now() });
    if (draft) await ctx.db.delete("chatDrafts", draft._id);
    return null;
  },
});
