// A free first guess at fit, worked out when a job is saved, with no AI call. It ranks the list until
// the AI score arrives, and decides which jobs the AI scores first.

import type { Infer } from "convex/values";
import { inBengaluru, remoteForIndia } from "./places";
import { titleMatches } from "./salesRoles";
import type { resumeV } from "./validators";

type Resume = Infer<typeof resumeV>;

const STOP = new Set(
  "with from that this have will your their they them were been into over more than such also about across which while where when what team teams work working role roles years year experience strong ability using including within other each both well very make made help helped across company companies business".split(" "),
);

const words = (text: string) => new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

/** The CV's own vocabulary: skills, roles, headline and achievements. */
export function cvWords(cv: Resume) {
  return words(
    [cv.headline, cv.summary, ...cv.skills.technical, ...cv.skills.soft, ...cv.experience.flatMap((e) => [e.role, e.blurb, ...e.bullets])].join(" "),
  );
}

/**
 * 0 to 100: title against the track titles (50), CV words found in the job (35), and place (15).
 * `home` is the person's own location, like "Bengaluru, India".
 */
export function quickFit(job: { title: string; description?: string; location: string; workSetting?: string }, vocab: Set<string>, titles: string[], home: string) {
  const norm = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim()} `;
  const title = norm(job.title);
  const titleShare = Math.max(
    0,
    ...titles.map((t) => {
      const want = norm(t);
      // The whole phrase ("business operations") counts fully; the words scattered about count less.
      if (title.includes(want)) return 1;
      // Every word in another order, or a leader title worded differently: "Manager - Sales Development, India".
      if (titleMatches(t, job.title)) return 0.9;
      const parts = want.trim().split(" ").filter(Boolean);
      const found = parts.filter((w) => title.includes(` ${w} `)).length;
      return found === parts.length ? 0.6 : (found / Math.max(1, parts.length)) * 0.3;
    }),
  );
  const jobWords = words(`${job.title} ${job.description ?? ""}`);
  const shared = [...vocab].filter((w) => jobWords.has(w)).length;
  // Forty-five shared words is about as good as it gets; a job with no description can only reach part way.
  const cvShare = Math.min(1, shared / 45);
  const where = `${job.location} ${job.title}`;
  const homeCity = home.split(",")[0].trim().toLowerCase();
  const place =
    (homeCity && where.toLowerCase().includes(homeCity)) || (/bengaluru|bangalore/i.test(home) && inBengaluru(where))
      ? 1
      : remoteForIndia(job.location, job.workSetting)
        ? 0.9
        : /\bindia\b/i.test(where)
          ? 0.5
          : 0;
  // A role for speakers of another language says so in the title: "Account Executive - Spanish".
  const language = LANGUAGE.test(job.title) ? 0.4 : 1;
  // A sales job at a hotel, bank or builder shares the title but not the work: a full description
  // that never mentions software or SaaS counts for less.
  const desc = job.description ?? "";
  const industry = desc.length > 400 && !TECH.test(`${job.title} ${desc}`) ? 0.6 : 1;
  // Any long description shares plenty of CV words, so they count fully only when the title fits too:
  // a bank's "Acquisition Manager" in Bengaluru shouldn't reach the apply list on words and place alone.
  const cvWeight = titleShare >= 0.6 ? 35 : 15;
  return Math.round((titleShare * 50 + cvShare * cvWeight + place * 15) * language * industry);
}

const TECH = /\b(saas|b2b|software|cloud|api|apis|startup|subscription|arr|cybersecurity|devops|martech|fintech|edtech|ai|artificial intelligence|machine learning|tech (company|startup|platform)|technology (company|platform))\b/i;

const LANGUAGE = /\b(spanish|french|german|italian|portuguese|dutch|japanese|korean|mandarin|chinese|cantonese|arabic|turkish|polish|russian|swedish|danish|norwegian|finnish|hebrew|thai|vietnamese|indonesian|bahasa)\b|\b(dach|nordics|benelux)\b/i;
