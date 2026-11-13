"use node";

// "Your top 5 sales jobs today" on the homepage, before signing up: a CV, up to 3 titles and a place in, the five
// open roles that fit best out, ranked by the free first guess (no AI). The CV is read and thrown away.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { fileText } from "./agent";
import { quickFit, textSenior, textWords } from "./lib/quickFit";
import { titleMatches } from "./lib/salesRoles";
import { openNow, placeCheck, type Role } from "./subscriberSend";
import { readSignup } from "./subscribers";

const MAX_BYTES = 5 * 1024 * 1024;

const topJobV = v.object({ title: v.string(), company: v.string(), where: v.string(), url: v.string(), match: v.string(), fit: v.number() });

/** How the guess reads to someone: words, not a number that looks like an AI score. */
const matchWord = (fit: number) => (fit >= 70 ? "Strong match" : fit >= 50 ? "Good match" : "Possible match");

export const topJobs = action({
  args: { fileName: v.string(), file: v.bytes(), titles: v.array(v.string()), location: v.string() },
  returns: v.object({ jobs: v.array(topJobV), looked: v.number() }),
  handler: async (ctx, args) => {
    // The same cleaning as the jobs email sign-up, without the email.
    const { titles, location } = readSignup({ email: "x@example.com", titles: args.titles.slice(0, 10), location: args.location });
    if (args.file.byteLength > MAX_BYTES) throw new ConvexError("That file is over 5 MB. Upload a smaller PDF.");
    if (!(await ctx.runMutation(internal.limits.takeCvTop, {}))) throw new ConvexError("Lots of people are trying this today. Please try again tomorrow, or sign up to see every match.");
    const text = (await fileText(new Blob([args.file]), args.fileName)).trim();
    if (text.length < 300) throw new ConvexError("Couldn't read much text from that file. If it's a scanned image, export it from Word or Canva as a PDF.");

    const inPlace = placeCheck(location);
    const seen = new Set<string>();
    const roles = (await openNow(ctx, titles, location)).filter((r: Role) => {
      const key = `${r.title}|${r.company}`.toLowerCase();
      if (seen.has(key) || !inPlace(r) || !titles.some((t) => titleMatches(t, r.title))) return false;
      seen.add(key);
      return true;
    });
    // Titles and places first, on everything; then the best 60 get their descriptions read for the CV words.
    const vocab = textWords(text);
    const senior = textSenior(text);
    const home = /^(remote|india)$/i.test(location) ? "India" : `${location}, India`;
    const rough = roles.map((r) => ({ r, fit: quickFit(r, vocab, titles, home, senior) })).sort((a, b) => b.fit - a.fit).slice(0, 60);
    const texts: { externalId: string; description: string }[] = await ctx.runQuery(internal.careers.textsFor, { externalIds: rough.map((x) => x.r.externalId) });
    const byId = new Map(texts.map((t) => [t.externalId, t.description]));
    const best = rough
      .map(({ r }) => ({ r, fit: quickFit({ ...r, description: byId.get(r.externalId) }, vocab, titles, home, senior) }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 5);
    return {
      looked: roles.length,
      jobs: best.map(({ r, fit }) => ({ title: r.title, company: r.company, where: r.location || "Not listed", url: r.url, match: matchWord(fit), fit })),
    };
  },
});
