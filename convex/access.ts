import { getAuthUserId, invalidateSessions, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { hasAccess, isOwnerEmail } from "./lib/auth";
import { trialEnd, trialOver } from "./lib/trial";
import { appUrl, emailOn, sendEmail, welcomeEmail } from "./lib/email";

async function requireOwner(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get("users", userId) : null;
  if (!isOwnerEmail(user?.email)) throw new ConvexError("Only the owner can manage the waitlist.");
}

export const allowed = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await hasAccess(ctx, userId),
});

/** Whether you're let in yet, and whether you've joined the waitlist. Null when signed out. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const user = await ctx.db.get("users", userId);
    return { approved: await hasAccess(ctx, userId), onWaitlist: !!row, answered: !!row?.name, rejected: !!row?.rejected, email: user?.email ?? "" };
  },
});

/** Put yourself on the waitlist. Safe to call more than once. */
export const join = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    const existing = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (existing) return null;
    const user = await ctx.db.get("users", userId);
    await ctx.db.insert("access", { userId, email: user?.email ?? "", approved: false });
    // The owner hears about new joiners in the one morning email (growth.sendMorning), not one email each.
    return null;
  },
});

/** Roles that are let straight in. Anyone picking "Other" waits for the owner to check their LinkedIn. */
const SALES_ROLES = new Set(["Account Executive", "SDR / BDR", "Sales leadership", "GTM strategy / AI GTM", "Founder's Office"]);

/**
 * Name, LinkedIn and the role you're after. Picking a sales role lets you in straight away (trial starts now,
 * welcome email goes out), so people arriving from search don't wait days. Returns whether you're in.
 */
export const describe = mutation({
  args: { name: v.string(), linkedin: v.string(), role: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    const name = args.name.trim().slice(0, 100);
    const linkedin = args.linkedin.trim().slice(0, 300);
    const role = args.role.trim().slice(0, 60);
    if (!name) throw new ConvexError("Add your name.");
    if (!role) throw new ConvexError("Pick the role you're after.");
    if (linkedin && !/^(https?:\/\/)?([a-z]+\.)?linkedin\.com\//i.test(linkedin)) throw new ConvexError("That doesn't look like a LinkedIn profile link.");
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (!row) throw new ConvexError("Join the waitlist first.");
    const letIn = SALES_ROLES.has(role) && !row.approved && !row.rejected;
    await ctx.db.patch("access", row._id, { name, linkedin: linkedin || undefined, role, ...(letIn ? { approved: true, decidedAt: Date.now() } : {}) });
    if (letIn) await queueWelcome(ctx, row._id);
    return letIn;
  },
});

/** Everyone who signed up, waiting first. Owner only. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const notIn = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", false)).order("desc").take(200);
    const approved = await ctx.db.query("access").withIndex("by_approved", (q) => q.eq("approved", true)).order("desc").take(200);
    return { waiting: notIn.filter((a) => !a.rejected), rejected: notIn.filter((a) => a.rejected), approved, emailOn: emailOn() };
  },
});

/** Queue the "you're in" email, once per person. Does nothing when email is off. */
async function queueWelcome(ctx: MutationCtx, accessId: Id<"access">) {
  if (!emailOn()) return;
  await ctx.scheduler.runAfter(0, internal.access.sendWelcome, { accessId });
}

export const welcomeTarget = internalQuery({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }) => {
    const row = await ctx.db.get("access", accessId);
    if (!row?.email || !row.approved || row.welcomedAt) return null;
    return { email: row.email, name: row.name, role: row.role };
  },
});

export const markWelcomed = internalMutation({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }) => {
    await ctx.db.patch("access", accessId, { welcomedAt: Date.now() });
    return null;
  },
});

export const joinerDetails = internalQuery({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }) => {
    const row = await ctx.db.get("access", accessId);
    if (!row || row.approved || row.rejected) return null;
    return { email: row.email, name: row.name, linkedin: row.linkedin, role: row.role };
  },
});

/** Emails the owner that someone new is waiting, with what they told us and a link to let them in. */
export const tellOwner = internalAction({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }) => {
    const owner = (env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean)[0];
    const p = await ctx.runQuery(internal.access.joinerDetails, { accessId });
    if (!owner || !p) return null;
    await sendEmail({
      to: owner,
      subject: `JobPipe waitlist: ${p.name || p.email} joined`,
      text: [
        "Someone new is on the waitlist.",
        "",
        `Name: ${p.name || "(not given yet)"}`,
        `Email: ${p.email}`,
        `Role: ${p.role || "(not given)"}`,
        `LinkedIn: ${p.linkedin || "(not given)"}`,
        "",
        `Let them in: ${appUrl()}/admin`,
      ].join("\n"),
    });
    return null;
  },
});

/** Sends the personal "you're in" email: their first name, the role they asked for, and how to start. */
export const sendWelcome = internalAction({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }) => {
    const target = await ctx.runQuery(internal.access.welcomeTarget, { accessId });
    if (!target) return null;
    await sendEmail({ to: target.email, ...welcomeEmail(target) });
    await ctx.runMutation(internal.access.markWelcomed, { accessId });
    return null;
  },
});

export const setApproved = mutation({
  args: { accessId: v.id("access"), approved: v.boolean() },
  handler: async (ctx, { accessId, approved }) => {
    await requireOwner(ctx);
    const row = await ctx.db.get("access", accessId);
    if (!row) throw new ConvexError("That person isn't on the waitlist any more.");
    await ctx.db.patch("access", accessId, { approved, rejected: approved ? false : row.rejected, decidedAt: Date.now() });
    if (approved) await queueWelcome(ctx, accessId);
    // Taken off the app: stop their morning searches too.
    if (!approved) {
      const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", row.userId)).unique();
      if (profile?.autopilot) await ctx.db.patch("profiles", profile._id, { autopilot: false });
    }
    return null;
  },
});

/** Turn someone down, or take that back. They're never let in by it; "Let in" undoes it. Owner only. */
export const setRejected = mutation({
  args: { accessId: v.id("access"), rejected: v.boolean() },
  handler: async (ctx, { accessId, rejected }) => {
    await requireOwner(ctx);
    const row = await ctx.db.get("access", accessId);
    if (!row) throw new ConvexError("That person isn't on the waitlist any more.");
    await ctx.db.patch("access", accessId, { rejected, ...(rejected ? { approved: false } : {}), decidedAt: Date.now() });
    return null;
  },
});

/** Let several people in at once. Owner only. */
export const approveMany = mutation({
  args: { accessIds: v.array(v.id("access")) },
  handler: async (ctx, { accessIds }) => {
    await requireOwner(ctx);
    const now = Date.now();
    const emails: string[] = [];
    for (const id of accessIds.slice(0, 100)) {
      const row = await ctx.db.get("access", id);
      if (!row || row.approved) continue;
      await ctx.db.patch("access", id, { approved: true, rejected: false, decidedAt: now });
      await queueWelcome(ctx, id);
      if (row.email) emails.push(row.email);
    }
    return emails;
  },
});

/** Who a password reset is for, checked as the owner. */
export const resetTarget = internalQuery({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }) => {
    await requireOwner(ctx);
    const row = await ctx.db.get("access", accessId);
    if (!row?.email) throw new ConvexError("That person isn't on the waitlist any more.");
    return { userId: row.userId, email: row.email };
  },
});

/**
 * A new temporary password for someone who forgot theirs, shown to the owner to pass on. Owner only.
 * For when the emailed reset code doesn't reach them (or email is off). It also signs them out everywhere.
 */
export const resetPassword = action({
  args: { accessId: v.id("access") },
  handler: async (ctx, { accessId }): Promise<{ email: string; password: string }> => {
    const { userId, email } = await ctx.runQuery(internal.access.resetTarget, { accessId });
    // 12 letters and digits, without look-alikes (0/O, 1/l/I), so it's easy to read out or type.
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const password = Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => chars[n % chars.length]).join("");
    await modifyAccountCredentials(ctx, { provider: "password", account: { id: email, secret: password } });
    await invalidateSessions(ctx, { userId });
    return { email, password };
  },
});

/** Your account at a glance, for the menu and the Account page: name, email, LinkedIn and paid time. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    const resume = profile?.defaultResumeId ? await ctx.db.get("resumes", profile.defaultResumeId) : null;
    return {
      email: user?.email ?? "",
      name: row?.name || resume?.resume.name || "",
      linkedin: row?.linkedin ?? "",
      paidUntil: row?.paidUntil ?? null,
      trialEndsAt: trialEnd(row),
      trialOver: !isOwnerEmail(user?.email) && trialOver(row, Date.now()),
      isOwner: isOwnerEmail(user?.email),
      // The owner has no waitlist row, so there's nowhere to keep an edited name.
      canEdit: !!row,
    };
  },
});

/** Change your name and LinkedIn link. */
export const updateProfile = mutation({
  args: { name: v.string(), linkedin: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    const name = args.name.trim().slice(0, 100);
    const linkedin = args.linkedin.trim().slice(0, 300);
    if (!name) throw new ConvexError("Add your name.");
    if (linkedin && !/^(https?:\/\/)?([a-z]+\.)?linkedin\.com\//i.test(linkedin)) throw new ConvexError("That doesn't look like a LinkedIn profile link.");
    const row = await ctx.db.query("access").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (!row) throw new ConvexError("Your name comes from your CV.");
    await ctx.db.patch("access", row._id, { name, linkedin: linkedin || undefined });
    return null;
  },
});

export const emailOf = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => (await ctx.db.get("users", userId))?.email ?? "",
});

/** Change your password: the current one first, so someone at an unlocked laptop can't. */
export const changePassword = action({
  args: { current: v.string(), next: v.string() },
  handler: async (ctx, { current, next }): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in again.");
    if (next.length < 8) throw new ConvexError("Use at least 8 characters.");
    const email: string = await ctx.runQuery(internal.access.emailOf, { userId });
    try {
      await retrieveAccount(ctx, { provider: "password", account: { id: email, secret: current } });
    } catch {
      throw new ConvexError("That current password isn't right.");
    }
    await modifyAccountCredentials(ctx, { provider: "password", account: { id: email, secret: next } });
    return null;
  },
});

