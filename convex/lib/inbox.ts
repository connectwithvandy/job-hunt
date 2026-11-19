// Reads a recruiting email sent in by the Gmail script: which stage it means, and which job it's about.
// Plain keyword rules, no AI, so it costs nothing to run every hour.

import { v } from "convex/values";
import { companyKey } from "./company";

export const inboxMessageV = v.object({ id: v.string(), from: v.string(), subject: v.string(), snippet: v.string(), date: v.string() });
export type InboxMessage = { id: string; from: string; subject: string; snippet: string; date: string };
export const stageV = v.union(v.literal("applied"), v.literal("screening"), v.literal("interview"), v.literal("offer"), v.literal("rejected"));

/** LinkedIn's email saying someone messaged you. The company is in the message, not the sender, so the AI reads it. */
export function isLinkedInMessage(m: InboxMessage) {
  return /linkedin\.com/i.test(m.from) && /(messages-noreply|inmail|hit-reply)/i.test(m.from);
}
export type Stage = "applied" | "screening" | "interview" | "offer" | "rejected";

// Checked in this order: an offer or a no beats everything; "thanks for applying" emails often
// mention the interview process, so they're read before interviews.
const RULES: [Stage, RegExp][] = [
  ["offer", /\b(offer letter|pleased to offer|extend(ing)? (you )?an offer|formal offer)\b/i],
  ["rejected", /\b(unfortunately|not (be )?moving forward|decided to (move|proceed) (forward )?with other|regret to inform|other candidates|not been selected|not selected|position has (now )?been filled|will not be progressing)\b/i],
  ["applied", /\b((received|receipt of) your application|thank(s| you) for (applying|your application)|application (has been |was )?(received|submitted))\b/i],
  ["interview", /\b(interview|schedule (a |some )?(time|call|chat)|calendly|your availability|next round|meet (with )?the team)\b/i],
  // Also a recruiter writing first: "learn more about your background", "your next move", "a quick phone screen".
  ["screening", /\b(recruiter|talent acquisition|quick (call|chat)|phone screen|learn more about your?|your background|(your|next) (career )?move|next steps|your profile stood out)\b/i],
];

/**
 * An automatic note that needs no answer: sent from a no-reply address, saying something was received, confirmed or booked
 * ("Interview availability received", "Your interview is confirmed"). It still moves the job along; it just isn't a reply to write.
 */
export function needsNoAnswer(m: Pick<InboxMessage, "from" | "subject" | "snippet">) {
  const noReply = /(no-?reply|do-?not-?reply|notifications?@|mailer)/i.test(m.from);
  const automatic = /\b(received|confirmed|confirmation|scheduled|booked|has been (scheduled|confirmed|submitted)|thank(s| you) for (providing|submitting|sharing) your availability|calendar invitation)\b/i;
  return noReply && automatic.test(`${m.subject}\n${m.snippet.slice(0, 600)}`);
}

export function stageOf(m: InboxMessage): Stage | null {
  const text = `${m.subject}\n${m.snippet}`;
  return RULES.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** The job this email is about: its company named by the sender, their domain or the subject. */
export function jobFor<J extends { company: string; updatedAt: number; title?: string }>(m: InboxMessage, jobs: J[]): J | null {
  const domain = m.from.match(/@([a-z0-9.-]+)/i)?.[1]?.split(".").slice(-2, -1)[0] ?? "";
  const text = companyKey(`${m.from.replace(/<[^>]*>/, " ")} ${HIRING_TOOLS.has(domain.toLowerCase()) ? "" : domain} ${m.subject}`);
  // Very short names ("ADA") would match by accident inside other words.
  const hits = jobs.filter((j) => {
    const key = companyKey(j.company);
    return key.length >= 4 && text.includes(key);
  });
  // A recruiter at axis.com writing about "Axis Communications": the sender's own domain names the company.
  const own = domain.length >= 4 && !FREE_MAIL.has(domain.toLowerCase()) && !HIRING_TOOLS.has(domain.toLowerCase());
  const byDomain = own ? jobs.filter((j) => companyKey(j.company).startsWith(domain.toLowerCase())) : [];
  const found = (hits.length ? hits : byDomain).sort((a, b) => b.updatedAt - a.updatedAt);
  // The email names its role ("joining ElevenLabs as a Sales Development Lead"): only a job with that title gets it.
  // None fits, so it's about a role you don't have here yet: the AI reads it instead of it landing on the wrong job
  // (19 Nov: a receipt for "Sales Development Lead - North America" sat on "SMB Lead - APAC").
  const role = roleNamed(`${m.subject}\n${m.snippet.slice(0, 800)}`);
  if (!role) return found[0] ?? null;
  const fits = found
    .map((j) => ({ j, fit: titleFit(j.title ?? "", role) }))
    .filter((x) => x.fit >= 0.6)
    .sort((a, b) => b.fit - a.fit);
  return fits[0]?.j ?? null;
}

// Words that say nothing about which role it is.
const ROLE_FILLER = new Set(["the", "a", "an", "and", "of", "for", "at", "in", "to", "with", "role", "position", "job", "opening", "our", "your"]);
const roleWords = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !ROLE_FILLER.has(w)));

/**
 * The role an email names, when it names one: "joining X as a Sales Lead.", "for the Sales Lead position",
 * "your application for our Account Executive role". Null when it doesn't say.
 */
export function roleNamed(text: string): string | null {
  const patterns = [
    /\bas an? ([A-Z][^.\n!?]{1,80}?)\s*(?:[.!?\n]|$|\bat\b|\bwith\b|\b[Rr]ole\b|\b[Pp]osition\b)/,
    /\b(?:for|to) (?:the |our )?([A-Z][^.\n!?]{1,80}?) (?:[Pp]osition|[Rr]ole|[Oo]pening|[Jj]ob)\b/,
  ];
  for (const re of patterns) {
    const hit = text.match(re)?.[1]?.trim();
    if (hit && roleWords(hit).size) return hit;
  }
  return null;
}

// Words that say how senior a role is. "Sr Manager, Sales Development" and "Sales Development, Direct - Outbound - SMB"
// share "sales development" but are different jobs (19 Nov: Rippling's Sr Manager interview email sat on the SMB job).
const SENIORITY = new Set(["sr", "senior", "manager", "director", "head", "lead", "vp", "chief", "principal", "associate", "junior", "jr", "intern"]);

/**
 * How much of the shorter of a job title and a named role the other one shares, 0 to 1.
 * When both name a level and the levels differ ("Director" vs "Manager"), the fit halves. A level on one side only
 * ("Senior Account Executive" vs "Account Executive") doesn't count against it: emails often shorten the title.
 */
export function titleFit(title: string, role: string): number {
  const a = roleWords(title);
  const b = roleWords(role);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  const fit = common / Math.min(a.size, b.size);
  const la = [...a].filter((w) => SENIORITY.has(w));
  const lb = [...b].filter((w) => SENIORITY.has(w));
  const clash = la.length > 0 && lb.length > 0 && (la.some((w) => !b.has(w)) || lb.some((w) => !a.has(w)));
  return clash ? fit / 2 : fit;
}

// Applicant tracking systems send emails for many companies, so their domains say nothing about which one.
const HIRING_TOOLS = new Set(["greenhouse", "lever", "myworkday", "workday", "ashbyhq", "smartrecruiters", "icims", "workable", "jobvite", "successfactors", "taleo", "breezy", "recruitee", "teamtailor", "linkedin", "naukri", "indeed"]);

export type CalendarEvent = { id: string; title: string; start: string; end: string; description: string; guests: string[]; link: string };

// Mail providers say nothing about the company, so their domains don't count.
const FREE_MAIL = new Set(["gmail", "googlemail", "yahoo", "outlook", "hotmail", "icloud", "live", "proton", "protonmail", "zoho", "google", "calendar"]);

/** The job a calendar meeting is about: its company in the title, the notes, or a guest's email domain. */
export function jobForEvent<J extends { company: string; updatedAt: number }>(e: CalendarEvent, jobs: J[]): J | null {
  const domains = e.guests.map((g) => g.match(/@([a-z0-9.-]+)/i)?.[1]?.split(".").slice(-2, -1)[0] ?? "").filter((d) => d && !FREE_MAIL.has(d));
  const text = companyKey(`${e.title} ${domains.join(" ")} ${e.description}`);
  const hits = jobs.filter((j) => {
    const key = companyKey(j.company);
    return key.length >= 4 && text.includes(key);
  });
  return hits.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

const ORDER = ["new", "applying", "applied", "screening", "interview", "offer"];

/** The status to move to, or null to leave the job alone. Statuses only move forward. */
export function nextStatus(current: string, stage: Stage): Stage | null {
  if (stage === "rejected") return ["applying", "applied", "screening", "interview"].includes(current) ? "rejected" : null;
  const now = ORDER.indexOf(current);
  return now >= 0 && ORDER.indexOf(stage) > now ? stage : null;
}
