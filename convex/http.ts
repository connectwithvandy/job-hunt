import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Recruiting emails from the Gmail script (see GmailSync on the Tracker page). */
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
    // Newer scripts ask for the morning summary too, and email it to their owner.
    const digest: { subject: string; text: string } | null = result.ok && b.digest === true ? await ctx.runMutation(internal.inbox.digest, { token }) : null;
    return new Response(JSON.stringify({ ...result, digest }), { status: result.ok ? 200 : 401, headers: { "Content-Type": "application/json" } });
  }),
});

export default http;
