import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Recruiting emails from the Gmail script (see GmailSync on the Applications page). */
http.route({
  path: "/inbox",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body: unknown = await req.json().catch(() => null);
    const b = body as { token?: unknown; messages?: unknown; digest?: unknown } | null;
    const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    if (!b || typeof b.token !== "string" || !Array.isArray(b.messages)) return new Response("Bad request", { status: 400 });
    const messages = b.messages.slice(0, 100).map((m: Record<string, unknown>) => ({
      id: text(m?.id, 100),
      from: text(m?.from, 300),
      subject: text(m?.subject, 300),
      snippet: text(m?.snippet, 1500),
      date: text(m?.date, 60),
    })).filter((m) => m.id);
    const token = b.token.slice(0, 100);
    const result: { ok: boolean; moved: number } = await ctx.runMutation(internal.inbox.ingest, { token, messages });
    // Newer scripts send the calendar too: meetings from yesterday to three weeks ahead.
    const c = (b as { events?: unknown }).events;
    if (result.ok && Array.isArray(c)) {
      const events = c.slice(0, 200).map((e: Record<string, unknown>) => ({
        id: text(e?.id, 300),
        title: text(e?.title, 300),
        start: text(e?.start, 60),
        end: text(e?.end, 60),
        description: text(e?.description, 1000),
        guests: Array.isArray(e?.guests) ? e.guests.slice(0, 30).map((g: unknown) => text(g, 200)) : [],
        link: text(e?.link, 500),
      })).filter((e) => e.id && e.start);
      await ctx.runMutation(internal.inbox.calendar, { token, events });
    }
    // Newer scripts ask for the morning summary too, and email it to their owner.
    const digest: { subject: string; text: string } | null = result.ok && b.digest === true ? await ctx.runMutation(internal.inbox.digest, { token }) : null;
    return new Response(JSON.stringify({ ...result, digest }), { status: result.ok ? 200 : 401, headers: { "Content-Type": "application/json" } });
  }),
});

/** Google's answer after someone clicks Connect Gmail and allows access. */
http.route({
  path: "/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const next: string = await ctx.runAction(internal.google.finish, { code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "" });
    return new Response(null, { status: 302, headers: { Location: next } });
  }),
});

export default http;
