"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readRecruitingEmails } from "./lib/brain";
import { inboxMessageV } from "./lib/inbox";

/** Emails from the Gmail script that matched no job: one cheap AI read for the batch, then saved by inbox.saveFromEmails. */
export const read = internalAction({
  args: { userId: v.id("users"), messages: v.array(inboxMessageV) },
  handler: async (ctx, { userId, messages }): Promise<null> => {
    // Counts as one added job; with today's allowance used up, these emails wait for no one and are dropped.
    try {
      await ctx.runMutation(internal.limits.consume, { userId, kind: "addJob" });
    } catch {
      return null;
    }
    const found = await readRecruitingEmails(messages);
    const items = found.flatMap((e) => {
      const message = messages.find((m) => m.id === e.id);
      return message && e.aboutRole && e.company.trim() ? [{ company: e.company.trim(), title: e.title.trim(), stage: e.stage, message }] : [];
    });
    if (items.length) await ctx.runMutation(internal.inbox.saveFromEmails, { userId, items });
    return null;
  },
});
