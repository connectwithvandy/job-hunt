import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { webhookGenuine } from "./lib/razorpay";
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

/** Razorpay's own word that a payment went through, in case the payer closed the page before it confirmed. */
http.route({
  path: "/razorpay/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return new Response("Not set up", { status: 503 });
    const body = await req.text();
    if (!(await webhookGenuine(secret, body, req.headers.get("x-razorpay-signature") ?? ""))) return new Response("Bad signature", { status: 401 });
    const event = JSON.parse(body) as { event?: unknown; payload?: { payment?: { entity?: { id?: unknown; order_id?: unknown; amount?: unknown } } } };
    const p = event.payload?.payment?.entity;
    if ((event.event === "payment.captured" || event.event === "order.paid") && typeof p?.id === "string" && typeof p.order_id === "string") {
      await ctx.runMutation(internal.payments.markPaid, { orderId: p.order_id, paymentId: p.id, amount: typeof p.amount === "number" ? p.amount : undefined });
    }
    // Anything else is acknowledged, so Razorpay doesn't keep retrying it.
    return new Response("ok", { status: 200 });
  }),
});

/**
 * Unsubscribe from the jobs emails (jobpipe.in/unsubscribe rewrites here). Opening the link only shows a button,
 * because mail scanners open links on their own; pressing it, or Gmail's one-click Unsubscribe (a POST), stops them.
 */
const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · JobPipe</title><meta name="robots" content="noindex"></head><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#0b0b0f;color:#f2f2f2;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px"><div style="max-width:420px;text-align:center"><h1 style="font-size:22px">${title}</h1>${body}<p style="margin-top:28px"><a href="https://jobpipe.in" style="color:#c6ff3d">jobpipe.in</a></p></div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const keyOf = (req: Request) => (new URL(req.url).searchParams.get("k") ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);

http.route({
  path: "/unsubscribe",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const k = keyOf(req);
    if (!k) return page("Link not complete", "<p>This unsubscribe link is missing its code. Reply to any of our emails with \"stop\" and I'll turn them off.</p>");
    return page(
      "Stop the jobs emails?",
      `<form method="post" action="/unsubscribe?k=${k}"><button style="background:#c6ff3d;color:#0b0b0f;border:0;border-radius:8px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`,
    );
  }),
});

http.route({
  path: "/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const done = await ctx.runMutation(internal.subscribers.unsubscribe, { key: keyOf(req) });
    return done
      ? page("You're unsubscribed", "<p>No more jobs emails. Changed your mind? Sign up again any time on jobpipe.in.</p>")
      : page("Link not recognised", "<p>This link may be old. Reply to any of our emails with \"stop\" and I'll turn them off.</p>");
  }),
});

export default http;
