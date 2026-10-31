// Find email: a hiring contact's work email from Hunter.io, on its free plan only.
// The whole app shares one monthly budget (HUNTER_MONTHLY, default 25), and each person gets a few a day.
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env, internalMutation, internalQuery, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { companyKey } from "./lib/company";
import { domainOf, hunterFind, isCompanyDomain, rootDomain, splitName } from "./lib/hunter";
import { hunterBudget } from "./limits";

const USED_UP = "This month's free email lookups are used up. More next month.";

/** Whether Find email works right now, so the card can say so before you click. */
export const status = query({
  args: {},
  handler: async (ctx): Promise<{ on: boolean; usedUp: boolean }> => {
    if (!(await getAuthUserId(ctx))) return { on: false, usedUp: false };
    const month = new Date().toISOString().slice(0, 7);
    const row = await ctx.db.query("hunterUsage").withIndex("by_month", (q) => q.eq("month", month)).unique();
    return { on: !!env.HUNTER_API_KEY, usedUp: (row?.count ?? 0) >= hunterBudget() };
  },
});

/** The person, and the company's website if the app already knows it from somewhere free. */
export const lookupFor = internalQuery({
  args: { userId: v.id("users"), jobId: v.id("jobs"), contactId: v.string() },
  handler: async (ctx, { userId, jobId, contactId }) => {
    const job = await ctx.db.get("jobs", jobId);
    if (!job || job.userId !== userId) throw new ConvexError("Job not found.");
    const person = job.hiringContacts?.find((c) => c.id === contactId);
    if (!person) return null;
    const key = companyKey(job.company);
    // Best first: a colleague's email you already have, then websites you or the app saved, then the job's own links.
    const fromEmails = (job.hiringContacts ?? []).filter((c) => c.email).map((c) => domainOf(c.email));
    const prospect = key ? await ctx.db.query("prospects").withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", key)).first() : null;
    const resumes = await ctx.db.query("resumes").withIndex("by_userId", (q) => q.eq("userId", userId)).take(10);
    const fromCv = resumes.flatMap((r) => r.resume.experience.filter((e) => e.domain && companyKey(e.company) === key).map((e) => domainOf(e.domain!)));
    const fromLinks = [job.url, job.sourceUrl ?? ""].map((u) => rootDomain(domainOf(u)));
    const mail = await ctx.db.query("jobEmails").withIndex("by_jobId_and_at", (q) => q.eq("jobId", jobId)).order("desc").take(10);
    const fromMail = [job.lastEmail?.from ?? "", ...mail.map((m) => m.from)].map((f) => rootDomain(domainOf(f)));
    const domain = [...fromEmails, domainOf(prospect?.website ?? ""), ...fromCv, ...fromLinks, ...fromMail].find(isCompanyDomain) ?? "";
    return { name: person.name, email: person.email, company: job.company, domain };
  },
});

/** Puts the found email on the person, read fresh, and only if they still have none. */
export const saveFound = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("jobs"), contactId: v.string(), email: v.string(), score: v.number(), verified: v.boolean() },
  handler: async (ctx, { userId, jobId, contactId, email, score, verified }) => {
    const job = await ctx.db.get("jobs", jobId);
    if (!job || job.userId !== userId) return false;
    const person = job.hiringContacts?.find((c) => c.id === contactId);
    if (!person || person.email) return false;
    const emailLookup = { email, score, verified, at: Date.now() };
    const hiringContacts = (job.hiringContacts ?? []).map((c) => (c.id === contactId ? { ...c, email, emailLookup } : c));
    await ctx.db.patch("jobs", jobId, { hiringContacts, updatedAt: Date.now() });
    return true;
  },
});

type FindResult =
  | { status: "found"; email: string; score: number; verified: boolean; domain: string; saved: boolean }
  | { status: "none"; domain: string }
  /** The app doesn't know the company's website, or Hunter couldn't use it: ask for it. */
  | { status: "needDomain"; tried: string };

/** Looks up one hiring contact's work email. `domain` is the company website, when you typed it. */
export const find = action({
  args: { jobId: v.id("jobs"), contactId: v.string(), domain: v.optional(v.string()) },
  handler: async (ctx, { jobId, contactId, domain: typed }): Promise<FindResult> => {
    const apiKey = env.HUNTER_API_KEY;
    if (!apiKey) throw new ConvexError("Find email isn't switched on yet.");
    const userId: Id<"users"> = await requireUserId(ctx);
    const info: { name: string; email: string; company: string; domain: string } | null = await ctx.runQuery(internal.emailFinder.lookupFor, { userId, jobId, contactId });
    if (!info) throw new ConvexError("That person isn't on this job any more.");
    if (info.email) throw new ConvexError(`${info.name} already has an email saved. Clear it with Edit to look again.`);
    const name = splitName(info.name);
    if (!name) throw new ConvexError("Add their first and last name first, so the lookup can match them.");
    let domain = info.domain;
    if (typed !== undefined) {
      domain = domainOf(typed);
      if (!isCompanyDomain(domain)) throw new ConvexError(`Type ${info.company}'s own website, like acme.com.`);
    }
    if (!domain) return { status: "needDomain", tried: "" };

    // Your daily share first (the owner has none), then one of the app's free monthly lookups.
    await ctx.runMutation(internal.limits.consume, { userId, kind: "findEmail", checkOnly: true });
    const held: boolean = await ctx.runMutation(internal.limits.reserveHunter, {});
    if (!held) throw new ConvexError(USED_UP);
    const out = await hunterFind(apiKey, domain, name.first, name.last);
    // Hunter only charges when it finds an email, so anything else hands the lookup back. Except "used up": its count is the real one.
    if (out.kind !== "found" && out.kind !== "usedUp") await ctx.runMutation(internal.limits.releaseHunter, {});
    if (out.kind === "found" || out.kind === "none") await ctx.runMutation(internal.limits.consume, { userId, kind: "findEmail" });

    switch (out.kind) {
      case "found": {
        const saved: boolean = await ctx.runMutation(internal.emailFinder.saveFound, { userId, jobId, contactId, email: out.email, score: out.score, verified: out.verified });
        return { status: "found", email: out.email, score: out.score, verified: out.verified, domain, saved };
      }
      case "none":
        return { status: "none", domain };
      case "badDomain":
        return { status: "needDomain", tried: domain };
      case "claimed":
        throw new ConvexError(`${info.name} asked not to have their email looked up. Message them on LinkedIn instead.`);
      case "usedUp":
        throw new ConvexError(USED_UP);
      case "error":
        throw new ConvexError(out.message);
    }
  },
});
