// The morning summary email: what happened since the last one, and what to do today.
// Built here as plain text; the person's own Gmail script sends it to them (no email service needed).

type Job = {
  _id: string;
  _creationTime: number;
  title: string;
  company: string;
  status: string;
  appliedAt?: number;
  scores?: { score: number }[];
  outreach: { name: string; status: string; sentAt?: number }[];
  lastEmail?: { at: number; stage: string };
};
type Dream = { name: string; openRoles?: number; rolesCheckedAt?: number };
type Run = { at: number; added: number; scored: number; strong: number };

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;

/** Due once a day, from 9:00 in India: after the morning run, and only if the last one went out on an earlier day. */
export function digestDue(lastAt: number | undefined, now: number) {
  const today = Math.floor((now + IST) / DAY);
  const hour = ((now + IST) % DAY) / 3_600_000;
  return hour >= 9 && (!lastAt || Math.floor((lastAt + IST) / DAY) < today);
}

const STAGE_WORDS: Record<string, string> = {
  offer: "Offer",
  interview: "Interview",
  screening: "Recruiter reply",
  applied: "Application received",
  rejected: "Rejected",
};

/** Null when there's nothing worth an email. */
export function buildDigest({ jobs, dreams, run, since, now, appUrl }: { jobs: Job[]; dreams: Dream[]; run: Run | null; since: number; now: number; appUrl: string }) {
  const best = (j: Job) => Math.max(-1, ...(j.scores ?? []).map((s) => s.score));
  const link = (j: Job) => `${appUrl}/jobs/${j._id}`;
  const sections: string[] = [];

  const replies = jobs.filter((j) => j.lastEmail && j.lastEmail.at > since).sort((a, b) => b.lastEmail!.at - a.lastEmail!.at);
  if (replies.length) {
    sections.push(`EMAILS FROM COMPANIES\n${replies.slice(0, 8).map((j) => `- ${STAGE_WORDS[j.lastEmail!.stage] ?? j.lastEmail!.stage}: ${j.title} at ${j.company}\n  ${link(j)}`).join("\n")}`);
  }

  const strong = jobs.filter((j) => j.status === "new" && best(j) >= 75).sort((a, b) => best(b) - best(a));
  if (strong.length) {
    const fresh = strong.filter((j) => j._creationTime > since).length;
    sections.push(
      `STRONG FITS TO APPLY TO${fresh ? ` (${fresh} new)` : ""}\n${strong
        .slice(0, 5)
        .map((j) => `- ${best(j)}  ${j.title} at ${j.company}${j._creationTime > since ? "  (new)" : ""}\n  ${link(j)}`)
        .join("\n")}${strong.length > 5 ? `\n  and ${strong.length - 5} more` : ""}`,
    );
  }

  const nudges = jobs.flatMap((j) => j.outreach.filter((o) => o.status === "sent" && o.sentAt && now - o.sentAt > 5 * DAY).map((o) => `${o.name} (${j.company})`));
  const quiet = jobs.filter((j) => j.status === "applied" && j.appliedAt && now - j.appliedAt > 10 * DAY);
  if (nudges.length || quiet.length) {
    const lines = [];
    if (nudges.length) lines.push(`- Nudge ${nudges.length} referral ask${nudges.length > 1 ? "s" : ""} with no reply after 5 days: ${nudges.slice(0, 4).join(", ")}${nudges.length > 4 ? "..." : ""}`);
    if (quiet.length) lines.push(`- ${quiet.length} application${quiet.length > 1 ? "s" : ""} quiet for 10+ days: ${quiet.slice(0, 4).map((j) => j.company).join(", ")}${quiet.length > 4 ? "..." : ""}. Worth a note to the hiring manager.`);
    sections.push(`FOLLOW UP\n${lines.join("\n")}`);
  }

  const hiring = dreams.filter((d) => (d.openRoles ?? 0) > 0 && (d.rolesCheckedAt ?? 0) > since);
  if (hiring.length) {
    sections.push(`DREAM 20 COMPANIES HIRING\n${hiring.slice(0, 8).map((d) => `- ${d.name}: ${d.openRoles} open role${d.openRoles! > 1 ? "s" : ""}`).join("\n")}\n  ${appUrl}/companies`);
  }

  if (!sections.length) return null;
  const head = run && now - run.at < DAY ? `This morning JobPipe found ${run.added} new job${run.added === 1 ? "" : "s"}, scored ${run.scored} and ${run.strong} fit strongly.\n\n` : "";
  const subjectBits = [
    replies.length && `${replies.length} email${replies.length > 1 ? "s" : ""} from companies`,
    strong.length && `${strong.length} strong fit${strong.length > 1 ? "s" : ""}`,
    hiring.length && `${hiring.length} dream compan${hiring.length > 1 ? "ies" : "y"} hiring`,
  ].filter(Boolean);
  return {
    subject: `JobPipe today: ${subjectBits.join(", ") || "things to follow up"}`,
    text: `${head}${sections.join("\n\n")}\n\nOpen JobPipe: ${appUrl}\n\nYour Gmail script sent this to you. To stop it, set DAILY_SUMMARY to false in the script.`,
  };
}
