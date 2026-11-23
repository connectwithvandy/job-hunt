// The founding-offer email to everyone not paying: their own numbers, ₹999 for 3 months, and one click to say why not.
// Preview:  npx convex run --prod offer:send '{"dryRun":true}'
// Test:     npx convex run --prod offer:send '{"to":"you@example.com"}'   (any address; not recorded)
// Send:     npx convex run --prod offer:send '{"limit":30}'   (a batch a day: the email plan allows 100 a day in all)
// Answers:  npx convex run --prod offerData:results '{}'

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { offerEmail, sendEmail } from "./lib/email";

export const send = internalAction({
  // `skip`: addresses never to send to in this run, e.g. a partner who isn't a job seeker (Vijeth of SaasPire, 23 Nov).
  args: { limit: v.optional(v.number()), dryRun: v.optional(v.boolean()), to: v.optional(v.string()), skip: v.optional(v.array(v.string())) },
  returns: v.string(),
  handler: async (ctx, { limit = 30, dryRun, to, skip = [] }): Promise<string> => {
    // A test goes to any address as it would to a member (numbers from the first member), and isn't recorded.
    if (to) {
      const anyone: { userId: Id<"users">; email: string; name?: string }[] = await ctx.runQuery(internal.offerData.recipients, {});
      const facts = anyone.length ? await ctx.runQuery(internal.offerData.factsFor, { userId: anyone[0].userId }) : { jobs: 682, scored: 40, strong: 6 };
      const mail = offerEmail({ name: "Vandana", ...facts, token: "TEST" });
      await sendEmail({ to, ...mail, subject: `[Test] ${mail.subject}` });
      return `Test sent to ${to}. The answer buttons open the page but won't save (test link).`;
    }
    const skipped = new Set(skip.map((e) => e.toLowerCase()));
    const all: { userId: Id<"users">; email: string; name?: string }[] = await ctx.runQuery(internal.offerData.recipients, {});
    const people = all.filter((p) => !skipped.has(p.email.toLowerCase()));
    if (!people.length) return "Everyone not paying has had it.";
    if (dryRun) {
      const p = people[0];
      const facts: { jobs: number; scored: number; strong: number } = await ctx.runQuery(internal.offerData.factsFor, { userId: p.userId });
      const mail = offerEmail({ name: p.name, ...facts, token: "PREVIEW" });
      return `${people.length} people would get it (${Math.min(limit, people.length)} in this batch): ${people.map((x) => x.email).join(", ")}. First one:\n\nSubject: ${mail.subject}\n\n${mail.text}`;
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
