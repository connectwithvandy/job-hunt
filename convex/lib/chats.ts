// Your LinkedIn chat history with each connection, read from LinkedIn's messages.csv,
// so the app knows who you actually talk to and notes can be written to match.
import { v, type Infer } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { referralRank } from "./company";

export const chatRowV = v.object({
  profileKey: v.string(),
  nameKey: v.string(),
  name: v.string(),
  messages: v.number(),
  fromMe: v.number(),
  firstAt: v.number(),
  lastAt: v.number(),
  /** The last few messages, trimmed, oldest first. */
  recent: v.array(v.object({ fromMe: v.boolean(), at: v.number(), text: v.string() })),
});
export type ChatRow = Infer<typeof chatRowV>;

/** "https://www.linkedin.com/in/Priya-Shah-12/?x=1" becomes "priya-shah-12". Empty when it isn't a profile link. */
export function profileKey(url: string) {
  const m = /\/in\/([^/?#]+)/i.exec(url);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

/** "Priya  Shah" and "priya shah" both become "priyashah", for when profile links don't line up. */
export function nameKey(name: string) {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export type Closeness = "close" | "talked" | "one-way" | "never";

const YEAR = 365 * 24 * 60 * 60 * 1000;

/** How well you know someone, from your chats: both of you writing, often and lately, means close. */
export function closeness(chat: Pick<ChatRow, "messages" | "fromMe" | "lastAt"> | null | undefined, now: number): Closeness {
  if (!chat || !chat.messages) return "never";
  const both = chat.fromMe > 0 && chat.fromMe < chat.messages;
  if (!both) return "one-way";
  return chat.messages >= 6 && now - chat.lastAt < 2 * YEAR ? "close" : "talked";
}

export const CLOSENESS_LABEL: Record<Closeness, string> = {
  close: "You talk",
  talked: "Talked before",
  "one-way": "One-way messages",
  never: "Never chatted",
};

const BONUS: Record<Closeness, number> = { close: 4, talked: 2, "one-way": 0, never: 0 };

/** The chat with this connection: by profile link, else by name. */
async function chatFor(ctx: QueryCtx, userId: Id<"users">, c: Doc<"contacts">) {
  const key = profileKey(c.linkedinUrl);
  if (key) {
    const byUrl = await ctx.db.query("linkedinChats").withIndex("by_userId_and_profileKey", (q) => q.eq("userId", userId).eq("profileKey", key)).first();
    if (byUrl) return byUrl;
  }
  const name = nameKey(`${c.firstName}${c.lastName}`);
  if (name.length < 4) return null;
  return await ctx.db.query("linkedinChats").withIndex("by_userId_and_nameKey", (q) => q.eq("userId", userId).eq("nameKey", name)).first();
}

/** Connections with your chat history attached, people you talk to first. Without `recent` unless asked, to keep pages light. */
export async function withChats(ctx: QueryCtx, userId: Id<"users">, people: Doc<"contacts">[], now: number, opts: { recent?: boolean } = {}) {
  const out = await Promise.all(
    people.map(async (p) => {
      const c = await chatFor(ctx, userId, p);
      const chat = c ? { messages: c.messages, fromMe: c.fromMe, firstAt: c.firstAt, lastAt: c.lastAt, recent: opts.recent ? c.recent : [] } : null;
      return { ...p, chat, closeness: closeness(chat, now) };
    }),
  );
  return out.sort((a, b) => referralRank(b.position) + BONUS[b.closeness] - (referralRank(a.position) + BONUS[a.closeness]));
}

export type ContactWithChat = Awaited<ReturnType<typeof withChats>>[number];
