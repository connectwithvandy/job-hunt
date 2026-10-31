// "Connect Gmail": one click to Google's own permission page, then JobPipe reads recruiting emails
// and the calendar every hour, the same way the Google Script does, through the same inbox code.
// Google lets an app it hasn't reviewed connect up to 100 people, enough for the beta.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireUserId } from "./lib/auth";
import type { CalendarEvent, InboxMessage } from "./lib/inbox";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];
// The same searches as the Google Script: recruiting emails and LinkedIn message alerts from the last two days.
const RECRUITING =
  'newer_than:2d -in:sent -category:promotions -category:social (application OR applying OR interview OR offer OR unfortunately OR candidacy OR recruiter OR "next steps")';
const LINKEDIN =
  "newer_than:2d from:(messages-noreply@linkedin.com OR inmail-hit-reply@linkedin.com OR hit-reply@linkedin.com)";

const redirectUri = () => `${process.env.CONVEX_SITE_URL}/google/callback`;
const appUrl = () =>
  (env.APP_URL ?? "https://jobpipe.in").replace(/\/$/, "");

// ---------- Tokens are kept encrypted ----------

/** The key that locks stored Google tokens, made from the app's Google secret. */
async function tokenKey() {
  if (!env.GOOGLE_CLIENT_SECRET)
    throw new ConvexError("Connect Gmail isn't set up yet.");
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `jobpipe-google-tokens:${env.GOOGLE_CLIENT_SECRET}`,
    ),
  );
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function lock(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await tokenKey(),
      new TextEncoder().encode(text),
    ),
  );
  return `${toB64(iv)}.${toB64(sealed)}`;
}

async function unlock(locked: string) {
  const [iv, sealed] = locked.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(iv) },
      await tokenKey(),
      fromB64(sealed),
    ),
  );
}

// ---------- What the page sees ----------

/** Whether Connect Gmail is offered, and whether you've connected. Never returns tokens. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("googleConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      available: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
      connected: !!row,
      email: row?.email ?? "",
      connectedAt: row?.connectedAt ?? null,
    };
  },
});

/** The Google permission page to send you to, with a one-time code tying the answer back to you. */
export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (!env.GOOGLE_CLIENT_ID)
      throw new ConvexError("Connect Gmail isn't set up yet.");
    const state = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await ctx.db.insert("googleStates", { userId, state });
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
});

/** Stop reading your Gmail: forgets the permission here and withdraws it at Google. */
export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const locked: string | null = await ctx.runMutation(
      internal.google.remove,
      { userId },
    );
    if (locked) {
      const token = await unlock(locked).catch(() => "");
      if (token)
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
          { method: "POST" },
        ).catch(() => null);
    }
    return null;
  },
});

// ---------- Google's answer ----------

/** Swaps Google's one-time answer for a lasting permission. Returns where to send the person next. */
export const finish = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, { code, state }): Promise<string> => {
    const userId: Id<"users"> | null = await ctx.runMutation(
      internal.google.takeState,
      { state },
    );
    if (!userId || !code) return `${appUrl()}/tracker?gmail=error`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      refresh_token?: string;
      id_token?: string;
      scope?: string;
    };
    // Without Gmail ticked on Google's page there's nothing to read.
    if (
      !res.ok ||
      !body.refresh_token ||
      !body.scope?.includes("gmail.readonly")
    )
      return `${appUrl()}/tracker?gmail=error`;
    // The id token came straight from Google over HTTPS, so its email can be read without checking the signature.
    let email = "";
    try {
      email =
        (
          JSON.parse(
            atob(
              (body.id_token ?? "")
                .split(".")[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/"),
            ),
          ) as { email?: string }
        ).email ?? "";
    } catch {}
    await ctx.runMutation(internal.google.save, {
      userId,
      email,
      refreshToken: await lock(body.refresh_token),
      calendar: body.scope.includes("calendar.readonly"),
    });
    return `${appUrl()}/tracker?gmail=connected`;
  },
});

export const takeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("googleStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (!row) return null;
    await ctx.db.delete("googleStates", row._id);
    // A permission page left open for over an hour has to be started again.
    return Date.now() - row._creationTime < 3_600_000 ? row.userId : null;
  },
});

export const save = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    refreshToken: v.string(),
    calendar: v.boolean(),
  },
  handler: async (ctx, { userId, ...fields }) => {
    const row = await ctx.db
      .query("googleConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (row)
      await ctx.db.patch("googleConnections", row._id, {
        ...fields,
        connectedAt: Date.now(),
      });
    else
      await ctx.db.insert("googleConnections", {
        userId,
        ...fields,
        connectedAt: Date.now(),
      });
    // The inbox code finds you by this private code, the same one the Google Script uses.
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile && !profile.inboxToken) {
      const token = [...crypto.getRandomValues(new Uint8Array(24))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await ctx.db.patch("profiles", profile._id, { inboxToken: token });
    }
    // Read the inbox now, so the page says connected straight away.
    await ctx.scheduler.runAfter(0, internal.google.syncOne, { userId });
    return null;
  },
});

export const remove = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("googleConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!row) return null;
    await ctx.db.delete("googleConnections", row._id);
    return row.refreshToken;
  },
});

// ---------- Every hour ----------

/** Everyone connected, a little apart, so one slow inbox can't hold up the rest. */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds: Id<"users">[] = await ctx.runQuery(
      internal.google.connectedUsers,
      {},
    );
    for (const [i, userId] of userIds.entries())
      await ctx.scheduler.runAfter(i * 5_000, internal.google.syncOne, {
        userId,
      });
    return null;
  },
});

export const connectedUsers = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("googleConnections").take(500)).map((r) => r.userId),
});

export const forSync = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("googleConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!row || !profile?.inboxToken) return null;
    return {
      refreshToken: row.refreshToken,
      calendar: row.calendar,
      inboxToken: profile.inboxToken,
    };
  },
});

/** Of these Gmail message ids, the ones not read before, so each email is fetched once. */
export const unseen = internalQuery({
  args: { userId: v.id("users"), ids: v.array(v.string()) },
  handler: async (ctx, { userId, ids }) => {
    const out: string[] = [];
    for (const id of ids) {
      const seen = await ctx.db
        .query("inboxSeen")
        .withIndex("by_userId_and_messageId", (q) =>
          q.eq("userId", userId).eq("messageId", id),
        )
        .first();
      if (!seen) out.push(id);
    }
    return out;
  },
});

/** One person's recruiting emails and meetings, through the same code the Google Script feeds. */
export const syncOne = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me: {
      refreshToken: string;
      calendar: boolean;
      inboxToken: string;
    } | null = await ctx.runQuery(internal.google.forSync, { userId });
    if (!me) return null;
    const access = await accessToken(await unlock(me.refreshToken));
    if (access === "revoked") {
      // They withdrew the permission at Google: forget it, and the page offers Connect again.
      await ctx.runMutation(internal.google.remove, { userId });
      return null;
    }
    if (!access) return null;
    const ids = [
      ...new Set([
        ...(await searchIds(access, RECRUITING, 50)),
        ...(await searchIds(access, LINKEDIN, 30)),
      ]),
    ];
    const fresh: string[] = ids.length
      ? await ctx.runQuery(internal.google.unseen, { userId, ids })
      : [];
    const messages = (
      await Promise.all(fresh.slice(0, 60).map((id) => readMessage(access, id)))
    ).filter((m): m is InboxMessage => !!m);
    await ctx.runMutation(internal.inbox.ingest, {
      token: me.inboxToken,
      messages,
    });
    if (me.calendar) {
      const events = await calendarEvents(access);
      if (events)
        await ctx.runMutation(internal.inbox.calendar, {
          token: me.inboxToken,
          events,
        });
    }
    return null;
  },
});

/** A short-lived pass to read with, "revoked" when the person withdrew the permission, or "" on a passing failure. */
async function accessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  }).catch(() => null);
  if (!res) return "";
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
  };
  if (body.error === "invalid_grant") return "revoked";
  if (!res.ok)
    console.warn("Google token refresh failed:", res.status, body.error);
  return body.access_token ?? "";
}

async function google<T>(access: string, url: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${access}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) {
    if (res) console.warn("Google API failed:", res.status, url.split("?")[0]);
    return null;
  }
  return (await res.json()) as T;
}

async function searchIds(access: string, q: string, max: number) {
  const body = await google<{ messages?: { id: string }[] }>(
    access,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: String(max) })}`,
  );
  return (body?.messages ?? []).map((m) => m.id);
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

/** The plain text of an email, from its first text/plain part, else its HTML with the tags taken out. */
function bodyText(part: Part | undefined): string {
  if (!part) return "";
  const decode = (d: string) =>
    new TextDecoder().decode(
      Uint8Array.from(atob(d.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0),
      ),
    );
  if (part.mimeType === "text/plain" && part.body?.data)
    return decode(part.body.data);
  for (const p of part.parts ?? []) {
    const text = bodyText(p);
    if (text) return text;
  }
  if (part.mimeType === "text/html" && part.body?.data)
    return decode(part.body.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  return "";
}

async function readMessage(
  access: string,
  id: string,
): Promise<InboxMessage | null> {
  const m = await google<{
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: Part & { headers?: { name: string; value: string }[] };
  }>(
    access,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
  );
  if (!m) return null;
  const header = (name: string) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  return {
    id: m.id,
    from: header("from").slice(0, 300),
    subject: header("subject").slice(0, 300),
    snippet: (bodyText(m.payload) || m.snippet || "").slice(0, 1500),
    date: new Date(Number(m.internalDate) || Date.now()).toISOString(),
  };
}

type GEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string }[];
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
};

/** Meetings from yesterday to three weeks ahead, like the Google Script sends. */
async function calendarEvents(access: string): Promise<CalendarEvent[] | null> {
  const now = Date.now();
  const params = new URLSearchParams({
    timeMin: new Date(now - 86_400_000).toISOString(),
    timeMax: new Date(now + 21 * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "200",
  });
  const body = await google<{ items?: GEvent[] }>(
    access,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
  );
  if (!body) return null;
  return (body.items ?? [])
    .map((e) => ({
      id: e.id.slice(0, 300),
      title: (e.summary ?? "").slice(0, 300),
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      description: (e.description ?? "").slice(0, 1000),
      guests: (e.attendees ?? [])
        .flatMap((a) => (a.email ? [a.email.slice(0, 200)] : []))
        .slice(0, 30),
      link: (
        e.hangoutLink ??
        e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")
          ?.uri ??
        e.location ??
        ""
      ).slice(0, 500),
    }))
    .filter((e) => e.id && e.start);
}
