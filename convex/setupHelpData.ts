// Who still needs the "two setups" help email (setupHelp.ts sends it): set up, but no Gmail and/or no LinkedIn connections.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isOwnerEmail } from "./lib/auth";
import type { SetupHelpKind } from "./lib/email";

const kindV = v.union(v.literal("both"), v.literal("gmail"), v.literal("linkedin"));
const DAY = 86_400_000;

/**
 * Everyone let in and set up who hasn't said stop and hasn't had this email, with what they still need.
 * Payers and partner people are included: the help is for everyone. `to` narrows it to one person (a test).
 */
export const recipients = internalQuery({
  args: { to: v.optional(v.string()) },
  returns: v.array(v.object({ userId: v.id("users"), email: v.string(), name: v.optional(v.string()), kind: kindV })),
  handler: async (ctx, { to }) => {
    const now = Date.now();
    const rows = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).take(1000);
    const out: { userId: Id<"users">; email: string; name?: string; kind: SetupHelpKind }[] = [];
    for (const r of rows) {
      if (!r.email) continue;
      if (to) {
        if (r.email.toLowerCase() !== to.toLowerCase()) continue;
      } else if (isOwnerEmail(r.email) || r.alertsOff || r.rejected) continue;
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", r.userId)).unique();
      if (!profile?.onboarded && !to) continue;
      if (!to && (await ctx.db.query("setupHelpSends").withIndex("by_userId", (q) => q.eq("userId", r.userId)).first())) continue;
      const google = await ctx.db.query("googleConnections").withIndex("by_userId", (q) => q.eq("userId", r.userId)).first();
      // The older Gmail script counts too, while it's still checking in.
      const needsGmail = !google && !(profile?.inboxAt && now - profile.inboxAt < 3 * DAY);
      const needsLinkedin = !profile?.contactsCount;
      if (!needsGmail && !needsLinkedin && !to) continue;
      // A test to someone already set up shows the full email.
      const kind: SetupHelpKind = (needsGmail && needsLinkedin) || (!needsGmail && !needsLinkedin) ? "both" : needsGmail ? "gmail" : "linkedin";
      out.push({ userId: r.userId, email: r.email, name: r.name, kind });
    }
    return out;
  },
});

export const record = internalMutation({
  args: { userId: v.id("users"), email: v.string(), kind: kindV },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("setupHelpSends", { ...args, sentAt: Date.now() });
    return null;
  },
});
