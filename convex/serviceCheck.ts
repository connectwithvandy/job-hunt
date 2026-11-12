"use node";

// Checks the outside services JobPipe depends on, for almost nothing: the morning email shows the result,
// and a few times a day the owner gets an email of its own if one is down (12 Nov: AI credit ran out at 10:26
// and nobody knew until people's CVs failed).

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, type ActionCtx } from "./_generated/server";
import { searchListings } from "./lib/dreamwork";
import { emailOn, sendEmail } from "./lib/email";
import { servicesDown, servicesSection, type ServiceFacts } from "./lib/services";

/** The short reason, like "invalid x-api-key", not the whole JSON error. */
function reason(err: unknown) {
  const raw = String((err as Error)?.message ?? err);
  const inner = raw.match(/"message":"([^"]+)"/)?.[1];
  const status = raw.match(/^(\d{3}) /)?.[1];
  return (inner ? `${status ? `${status} ` : ""}${inner}` : raw).replace(/\s+/g, " ").slice(0, 160);
}

async function checkAi(): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return "no API key set";
  try {
    // One word back from the smallest model: about $0.00001, and it fails the same way real work does when credit runs out.
    await new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).messages.create({ model: "claude-haiku-5-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }] });
    return null;
  } catch (err) {
    return reason(err);
  }
}

async function checkDreamwork(): Promise<string | null> {
  try {
    await searchListings("Account Executive", "Bengaluru", 1, 1);
    return null;
  } catch (err) {
    return reason(err);
  }
}

/** Apify's own usage page: free to read, and it shows how much of the month's credit is gone. */
async function checkApify(): Promise<ServiceFacts["apify"]> {
  if (!env.APIFY_TOKEN) return null;
  try {
    const res = await fetch("https://api.apify.com/v2/users/me/limits", { headers: { authorization: `Bearer ${env.APIFY_TOKEN}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { error: `answered ${res.status}` };
    const body = (await res.json()) as { data?: { limits?: { maxMonthlyUsageUsd?: number }; current?: { monthlyUsageUsd?: number } } };
    return { used: body.data?.current?.monthlyUsageUsd ?? 0, limit: body.data?.limits?.maxMonthlyUsageUsd ?? 0 };
  } catch (err) {
    return { error: reason(err) };
  }
}

async function check(ctx: ActionCtx): Promise<ServiceFacts> {
  const [ai, dreamwork, apify, google] = await Promise.all([checkAi(), checkDreamwork(), checkApify(), ctx.runQuery(internal.limits.googleUsed, {})]);
  return { ai, dreamwork, apify, google };
}

/** The SERVICES block for the morning email. */
export const section = internalAction({
  args: {},
  returns: v.object({ text: v.string(), alarm: v.boolean() }),
  handler: async (ctx) => servicesSection(await check(ctx)),
});

/** Run a few times a day: emails the owner only when a service is down right now. */
export const watch = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { dryRun }) => {
    const facts = await check(ctx);
    const { text } = servicesSection(facts);
    if (!servicesDown(facts)) return `All up.\n${text}`;
    const owner = (env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean)[0];
    if (dryRun || !emailOn() || !owner) return `Down (not emailed).\n${text}`;
    const down = [facts.ai && "AI", facts.dreamwork && "Dreamwork", facts.apify && "error" in facts.apify && "Apify"].filter(Boolean).join(", ");
    await sendEmail({ to: owner, subject: `JobPipe: ${down} down`, text: `${text}\n` });
    return `Emailed: ${down} down.`;
  },
});
