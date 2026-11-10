// The health block at the top of the owner's morning email: did the morning run reach everyone, and what needs a look.

export type RunFacts = { at: number; added: number; scored: number; strong: number; failed?: string[] };

export type HealthFacts = {
  /** People with morning search on. */
  people: number;
  runs: RunFacts[];
  letIn: number;
  paying: number;
  trialOver: number;
  lockingSoon: number;
  aiUsed: number;
  aiLimit: number;
  freshSent: number;
  /** Members with their roles set who got the daily new-jobs email in the last 26 hours, and how many have roles set. */
  dailySent: number;
  dailyOf: number;
};

/** Older than this is yesterday's run. The morning email goes out about 75 minutes after the run starts. */
const FRESH = 20 * 3_600_000;

/** Share of the app's daily AI limit that gets a warning. */
const AI_WARN = 0.8;

export function healthSection(f: HealthFacts, now: number, scoreCap: number) {
  const runs = f.runs.filter((r) => now - r.at < FRESH);
  const sum = (pick: (r: RunFacts) => number) => runs.reduce((n, r) => n + pick(r), 0);
  // "Google Jobs (this month's free searches are used up)" counts as Google Jobs.
  const failed = new Map<string, number>();
  for (const r of runs) for (const name of r.failed ?? []) failed.set(name.split(" (")[0], (failed.get(name.split(" (")[0]) ?? 0) + 1);
  const failures = [...failed].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} (${n})`);
  const missed = f.people - runs.length;
  const aiHigh = f.aiUsed >= f.aiLimit * AI_WARN;
  // Yesterday's 9:30 email (and its 12:30 catch-up) should reach most people with roles set. Under half means it broke.
  const dailyLow = f.dailyOf > 0 && f.dailySent < f.dailyOf / 2;
  const warnings = [
    missed > 0 && `WARNING: the morning run missed ${missed} of ${f.people} people.`,
    dailyLow && `WARNING: yesterday's daily jobs email reached only ${f.dailySent} of ${f.dailyOf} people.`,
    aiHigh && `WARNING: AI use is at ${f.aiUsed} of today's ${f.aiLimit} units. AI tools stop for everyone at the limit.`,
  ].filter((w): w is string => !!w);
  const text = [
    "HEALTH",
    ...warnings,
    `- Morning run: reached ${runs.length} of ${f.people} people`,
    `- Jobs: ${sum((r) => r.added)} added, ${sum((r) => r.scored)} scored, ${sum((r) => r.strong)} strong matches`,
    `- People: ${runs.filter((r) => !r.strong).length} with no strong match, ${runs.filter((r) => r.added <= 1).length} with 0 or 1 new jobs, ${runs.filter((r) => r.scored >= scoreCap).length} at the ${scoreCap} score limit`,
    `- Sources that failed: ${failures.join(", ") || "none"}`,
    `- Accounts: ${f.letIn} let in, ${f.paying} paying, ${f.trialOver} trial ended, ${f.lockingSoon} locking in 3 days`,
    `- AI use: ${f.aiUsed} of ${f.aiLimit} units today`,
    `- Fresh job alerts sent: ${f.freshSent}`,
    `- Daily jobs email (last 26 hours): ${f.dailySent} of ${f.dailyOf} people with roles set`,
  ].join("\n");
  return { text, alarm: warnings.length > 0, headline: `${runs.length} of ${f.people} ran` };
}
