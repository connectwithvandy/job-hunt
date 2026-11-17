// The founding-offer email to everyone not paying: their own numbers, ₹999 for 3 months, and one click to say why not.
// Preview:  npx convex run --prod offer:send '{"dryRun":true}'
// Test:     npx convex run --prod offer:send '{"to":"vandana@jobpipe.in"}'
// Send:     npx convex run --prod offer:send '{"limit":30}'   (a batch a day: the email plan allows 100 a day in all)
// Answers:  npx convex run --prod offerData:results '{}'

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { offerEmail, sendEmail } from "./lib/email";

export const send = internalAction({
  args: { limit: v.optional(v.number()), dryRun: v.optional(v.boolean()), to: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, { limit = 30, dryRun, to }): Promise<string> => {
    const people: { userId: Id<"users">; email: string; name?: string }[] = await ctx.runQuery(internal.offerData.recipients, { to });
    if (!people.length) return to ? `No one to send to: ${to} isn't let in, has paid, or already got it.` : "Everyone not paying has had it.";
    if (dryRun) {
      const p = people[0];
      const facts: { jobs: number; scored: number; strong: number } = await ctx.runQuery(internal.offerData.factsFor, { userId: p.userId });
      const mail = offerEmail({ name: p.name, ...facts, token: "PREVIEW" });
      return `${people.length} people would get it (${Math.min(limit, people.length)} in this batch). First one:\n\nSubject: ${mail.subject}\n\n${mail.text}`;
    }
    let sent = 0;
    const failed: string[] = [];
    for (const p of people.slice(0, limit)) {
      try {
        const facts: { jobs: number; scored: number; strong: number } = await ctx.runQuery(internal.offerData.factsFor, { userId: p.userId });
        const token = crypto.randomUUID().replace(/-/g, "");
        const mail = offerEmail({ name: p.name, ...facts, token });
        await sendEmail({ to: p.email, ...mail });
        await ctx.runMutation(internal.offerData.record, { userId: p.userId, email: p.email, token });
        sent++;
      } catch (err) {
        failed.push(`${p.email}: ${String((err as Error)?.message ?? err).slice(0, 120)}`);
        // Out of emails for today: stop rather than fail through the rest.
        if (/429|quota|limit/i.test(String(err))) break;
      }
    }
    const left = people.length - sent;
    return `Sent ${sent}. ${left} still to go.${failed.length ? `\nFailed:\n${failed.join("\n")}` : ""}`;
  },
});
