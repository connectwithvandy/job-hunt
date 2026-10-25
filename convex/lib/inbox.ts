// Reads a recruiting email sent in by the Gmail script: which stage it means, and which job it's about.
// Plain keyword rules, no AI, so it costs nothing to run every hour.

import { companyKey } from "./company";

export type InboxMessage = { id: string; from: string; subject: string; snippet: string; date: string };
export type Stage = "applied" | "screening" | "interview" | "offer" | "rejected";

// Checked in this order: an offer or a no beats everything; "thanks for applying" emails often
// mention the interview process, so they're read before interviews.
const RULES: [Stage, RegExp][] = [
  ["offer", /\b(offer letter|pleased to offer|extend(ing)? (you )?an offer|formal offer)\b/i],
  ["rejected", /\b(unfortunately|not (be )?moving forward|decided to (move|proceed) (forward )?with other|regret to inform|other candidates|not been selected|not selected|position has (now )?been filled|will not be progressing)\b/i],
  ["applied", /\b((received|receipt of) your application|thank(s| you) for (applying|your application)|application (has been |was )?(received|submitted))\b/i],
  ["interview", /\b(interview|schedule (a |some )?(time|call|chat)|calendly|your availability|next round|meet (with )?the team)\b/i],
  ["screening", /\b(recruiter|quick (call|chat)|learn more about you|next steps|your profile stood out)\b/i],
];

export function stageOf(m: InboxMessage): Stage | null {
  const text = `${m.subject}\n${m.snippet}`;
  return RULES.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** The job this email is about: its company named by the sender, their domain or the subject. */
export function jobFor<J extends { company: string; updatedAt: number }>(m: InboxMessage, jobs: J[]): J | null {
  const domain = m.from.match(/@([a-z0-9.-]+)/i)?.[1]?.split(".").slice(-2, -1)[0] ?? "";
  const text = companyKey(`${m.from.replace(/<[^>]*>/, " ")} ${domain} ${m.subject}`);
  // Very short names ("ADA") would match by accident inside other words.
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
