// The "two setups" help email: step-by-step Connect Gmail and LinkedIn connections, only the steps each person still needs.
// Preview:  npx convex run --prod setupHelp:send '{"dryRun":true}'
// Test:     npx convex run --prod setupHelp:send '{"to":"you@example.com"}'   (a member's address; not recorded)
// Send:     npx convex run --prod setupHelp:send '{"limit":30}'   (a batch a day: the email plan allows 100 a day in all)

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { sendEmail, setupHelpEmail, type SetupHelpKind } from "./lib/email";

type Person = { userId: Id<"users">; email: string; name?: string; kind: SetupHelpKind };

export const send = internalAction({
  args: { limit: v.optional(v.number()), dryRun: v.optional(v.boolean()), to: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, { limit = 30, dryRun, to }): Promise<string> => {
    if (to) {
      const [p]: Person[] = await ctx.runQuery(internal.setupHelpData.recipients, { to });
      const mail = setupHelpEmail({ name: p?.name ?? "Vandana", kind: p?.kind ?? "both" });
      await sendEmail({ to, ...mail, subject: `[Test] ${mail.subject}` });
      return `Test sent to ${to} (${p?.kind ?? "both"} version).`;
    }
    const people: Person[] = await ctx.runQuery(internal.setupHelpData.recipients, {});
    if (!people.length) return "Everyone set up has had it, or has both set up.";
    const counts = { both: 0, gmail: 0, linkedin: 0 };
    for (const p of people) counts[p.kind]++;
    if (dryRun) {
      const p = people.find((x) => x.kind === "both") ?? people[0];
      const mail = setupHelpEmail({ name: p.name, kind: p.kind });
      return `${people.length} people would get it (${counts.both} need both, ${counts.gmail} only Gmail, ${counts.linkedin} only LinkedIn; ${Math.min(limit, people.length)} in this batch). One of them:\n\nSubject: ${mail.subject}\n\n${mail.text}`;
    }
    let sent = 0;
    const failed: string[] = [];
    for (const p of people.slice(0, limit)) {
      try {
        await sendEmail({ to: p.email, ...setupHelpEmail({ name: p.name, kind: p.kind }) });
        await ctx.runMutation(internal.setupHelpData.record, { userId: p.userId, email: p.email, kind: p.kind });
        sent++;
      } catch (err) {
        failed.push(`${p.email}: ${String((err as Error)?.message ?? err).slice(0, 120)}`);
        // Out of emails for today: stop rather than fail through the rest.
        if (/429|quota|limit/i.test(String(err))) break;
      }
    }
    return `Sent ${sent}. ${people.length - sent} still to go.${failed.length ? `\nFailed:\n${failed.join("\n")}` : ""}`;
  },
});
