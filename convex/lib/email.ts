// Sends email through Resend (resend.com, free up to 3,000 a month) from vandana@jobpipe.in.
// Off when RESEND_API_KEY is missing: the waitlist page then falls back to opening your own email app.

import { env } from "../_generated/server";
import { FREE, PLANS } from "./plans";

export const FROM = "Vandy from JobPipe <vandana@jobpipe.in>";
export const REPLY_TO = "vandana@jobpipe.in";
const FOUNDER_LINKEDIN = "https://www.linkedin.com/in/meet-vandana/";

export const emailOn = () => !!env.RESEND_API_KEY;

export const appUrl = () => (env.APP_URL ?? "https://jobpipe.in").replace(/\/$/, "");

/** Waits before each new try. A bad address fails at once; only busy or broken moments are tried again. */
export const EMAIL_RETRY_WAITS = [1000, 3000];

/** Sends one email, trying again if Resend is busy or can't be reached. Throws with Resend's reason when it fails. */
export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string; bcc?: string; headers?: Record<string, string> }) {
  if (!env.RESEND_API_KEY) throw new Error("Email is off: RESEND_API_KEY isn't set.");
  // The same key on every try, so a try that worked but lost its reply can't send the email twice.
  const key = crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= EMAIL_RETRY_WAITS.length;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, ...(msg.bcc ? { bcc: [msg.bcc] } : {}), ...(msg.headers ? { headers: msg.headers } : {}) }),
      });
      if (res.ok) return;
      const failure = new Error(`Resend said ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (last || (res.status !== 429 && res.status < 500)) throw Object.assign(failure, { final: true });
    } catch (err) {
      if (last || (err as { final?: boolean }).final) throw err;
    }
    await new Promise((done) => setTimeout(done, EMAIL_RETRY_WAITS[attempt]));
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The "you're in" email, from the founder, built from what they told us on the waitlist. */
export function welcomeEmail(p: { name?: string; role?: string; email: string }) {
  const word = p.name?.trim().split(/\s+/)[0];
  // People type their name in lower case often enough; start it with a capital.
  const first = word && word[0].toUpperCase() + word.slice(1);
  const url = appUrl();
  // Opens the sign-in form (not "create account") with their email filled in.
  const link = `${url}/?signin=1&email=${encodeURIComponent(p.email)}`;
  const role = p.role?.trim();
  const steps = [
    `Sign in with ${p.email} and the password you picked: ${link}`,
    "Upload your CV. Any PDF works, Canva ones too.",
    role ? `Add "${role}" as your first role. Add more if you're open to others.` : "Pick the roles you're after. You can add more than one.",
    "Open Today each morning: new jobs scored against your CV, follow-ups due, and who you know at each company.",
  ];
  const subject = first ? `${first}, you're in on JobPipe` : "You're in on JobPipe";
  const hello = first ? `Hi ${first},` : "Hi,";
  const story = [
    "I'm Vandy, and I built JobPipe.",
    "I built it during my own job hunt. As a sales leader I was going after several kinds of roles at once (SDR leadership, AE, GTM), and keeping track of every job, CV version and referral took more time than the applying. So I built the tool I wanted: it finds the jobs, scores each one against my CV with a reason, tailors the CV without making anything up, and shows who I know at each company.",
    role ? `You're off the waitlist, and it's ready to start finding ${role} roles for you.` : "You're off the waitlist, and it's ready to start your search.",
  ];
  const outro =
    "You're one of the first people in, so things will break now and then. When they do, just reply to this email. It comes straight to me, and I read every one.";
  const text = `${hello}

${story.join("\n\n")}

Getting started takes about 5 minutes:
${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

${outro}

Good luck with the hunt,
Vandy
Founder, JobPipe
${url}
LinkedIn: ${FOUNDER_LINKEDIN}
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
${story.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<p><b>Getting started takes about 5 minutes:</b></p>
<ol style="padding-left:20px">${steps.map((s) => `<li style="margin-bottom:6px">${esc(s)}</li>`).join("")}</ol>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open JobPipe</a></p>
<p>${esc(outro)}</p>
<p>Good luck with the hunt,<br>Vandy<br><span style="color:#666">Founder, <a href="${url}" style="color:#666">JobPipe</a> · <a href="${FOUNDER_LINKEDIN}" style="color:#666">LinkedIn</a></span></p>
</div>`;
  return { subject, text, html };
}

/** The check-in two days before someone's free week ends, from the founder: what JobPipe did for them, then the price, no pressure. */
export function trialEmail(p: {
  name?: string;
  endsAt: number;
  month: number;
  pass: number;
  stats: { found: number; strong: number; cvs: number; applied: number; interviews: number };
}) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const url = appUrl();
  const ends = new Date(p.endsAt).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  const { found, strong, cvs, applied, interviews } = p.stats;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const did = [
    `${n(found, "job", "jobs")} found${strong ? `, ${strong} of them a strong fit` : ""}`,
    cvs && `${n(cvs, "tailored CV", "tailored CVs")} written`,
    applied && `${n(applied, "application", "applications")} tracked`,
    interviews && `${n(interviews, "job", "jobs")} at interview stage`,
  ].filter((l): l is string => !!l);
  const rupees = (r: number) => `₹${r.toLocaleString("en-IN")}`;

  const paras: string[] = found
    ? [
        `Your free week on JobPipe ends on ${ends}, so I wanted to check in myself.`,
        "Here's what it did for you so far:",
        ...(interviews ? ["Good luck with the interviews. That's the part that counts."] : []),
        ...(!cvs && !applied ? ["One thing worth trying before the week is out: star a job you like and open its tailored CV. That's where it saves the most time."] : []),
        `If it's saving you time, the Week Pass gives you every AI tool for a week you're applying hard: ${rupees(PLANS.week)}. Or it's ${rupees(p.month)} a month, or ${rupees(p.pass)} for 3 months. Nothing renews on its own, and UPI works: ${url}/billing`,
        "If it isn't, I'd really like to know why. Reply and tell me what's missing. It comes straight to me, and I read every one.",
      ]
    : [
        `Your free week on JobPipe ends on ${ends}, and it looks like it hasn't found you any jobs yet.`,
        "That usually means something got stuck at the start: the CV upload, the roles or the location. Reply and tell me where it got stuck, and I'll help you set it up.",
      ];
  // The list of what it did goes right after "Here's what it did".
  const listAt = found ? 2 : -1;
  const subject = first ? `${first}, a quick check-in` : "A quick check-in from JobPipe";
  const hello = first ? `Hi ${first},` : "Hi,";
  const textParas = [...paras];
  if (listAt > 0) textParas.splice(listAt, 0, did.map((l) => `- ${l}`).join("\n"));
  const text = `${hello}

${textParas.join("\n\n")}

Vandy
Founder, JobPipe
LinkedIn: ${FOUNDER_LINKEDIN}
`;
  const htmlParas = paras.map((t) => `<p>${esc(t).replace(`${url}/billing`, `<a href="${url}/billing">Plan &amp; billing</a>`)}</p>`);
  if (listAt > 0) htmlParas.splice(listAt, 0, `<ul style="padding-left:20px">${did.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`);
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
${htmlParas.join("\n")}
<p>Vandy<br><span style="color:#666">Founder, <a href="${url}" style="color:#666">JobPipe</a> · <a href="${FOUNDER_LINKEDIN}" style="color:#666">LinkedIn</a></span></p>
</div>`;
  return { subject, text, html };
}

/** A LinkedIn post someone could share about JobPipe, in their own voice. Names no company, so their employer isn't exposed. */
export function shoutoutPost(p: { title: string; offer: boolean }) {
  // "an SDR", "an Account Executive", "a Sales Manager": short capital words are read letter by letter.
  const firstWord = p.title.split(/\s+/)[0] ?? "";
  const spelled = /^[A-Z]{2,5}$/.test(firstWord);
  const a = (spelled ? /^[AEFHILMNORSX]/.test(firstWord) : /^[aeiou]/i.test(firstWord)) ? "an" : "a";
  const role = p.title ? ` for ${a} ${p.title} role` : "";
  const win = p.offer ? `I've got an offer${role}.` : `I've got an interview lined up${role}.`;
  return `Small win in my job search: ${win}

A tool that helped: JobPipe (jobpipe.in), built by Vandy for people hunting sales jobs. Each morning it finds new roles, scores each one against my CV with a reason, and tailors the CV for each application without making anything up. It also tracks every application and follow-up, so nothing slips.

If you're looking for a sales role, it's worth a look.

#jobsearch #sales #hiring`;
}

/** After someone's first interview or offer: congrats from the founder, and a no-pressure ask for a LinkedIn shoutout with the post ready. */
export function shoutoutEmail(p: { name?: string; title: string; offer: boolean }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const post = shoutoutPost(p);
  // Opens LinkedIn's post box with the draft filled in; they can change it before posting.
  const share = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(post)}`;
  const hello = first ? `Hi ${first},` : "Hi,";
  const subject = `Was JobPipe helpful${first ? `, ${first}` : ""}?`;
  const paras = [
    p.offer
      ? `Looks like an offer came through${p.title ? ` for the ${p.title} role` : ""}. Huge congratulations!`
      : `Looks like you've got an interview${p.title ? ` for the ${p.title} role` : ""}. Congratulations, and good luck!`,
    "Quick question: was JobPipe helpful in getting you there?",
    "If yes, would you give it a shoutout on LinkedIn? JobPipe is new and I'm building it on my own, so word of mouth is how other people in sales find it.",
    "I've written a draft below to make it easy. It doesn't name the company. Change anything you like, or write your own. If it wasn't helpful, just hit reply and tell me what was missing. I read every one.",
  ];
  const text = `${hello}

${paras.join("\n\n")}

--- Draft post ---
${post}
------------------

Post it on LinkedIn (opens with the draft filled in): ${share}

If you do post, tag me so I can thank you: ${FOUNDER_LINKEDIN}

Vandy
Founder, JobPipe
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
${paras.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<div style="border:1px solid #ddd;border-radius:8px;padding:14px 16px;white-space:pre-wrap;background:#fafafa">${esc(post)}</div>
<p style="margin:24px 0"><a href="${esc(share)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Post it on LinkedIn</a></p>
<p>If you do post, <a href="${FOUNDER_LINKEDIN}">tag me</a> so I can thank you.</p>
<p>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a></span></p>
</div>`;
  return { subject, text, html };
}

/** Two days after being let in without finishing setup: a short, friendly nudge from the founder. */
export function setupNudgeEmail(p: { name?: string; email: string; role?: string }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const link = `${appUrl()}/?signin=1&email=${encodeURIComponent(p.email)}`;
  const hello = first ? `Hi ${first},` : "Hi,";
  const subject = first ? `${first}, your JobPipe is half set up` : "Your JobPipe is half set up";
  const paras = [
    `You're in on JobPipe, but it looks like setup didn't get finished, so it hasn't started finding ${p.role ? `${p.role} roles` : "jobs"} for you yet.`,
    "It takes about 5 minutes: sign in, upload your CV (any PDF works), and pick the roles you want. From the next morning it finds new jobs and scores each one against your CV.",
    "If something got in the way, like the CV upload or the roles list, just reply and tell me. It comes straight to me, and I'll help you set it up.",
  ];
  const text = `${hello}

${paras.join("\n\n")}

Finish setting up: ${link}

Vandy
Founder, JobPipe
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
${paras.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Finish setting up</a></p>
<p>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a> · <a href="${FOUNDER_LINKEDIN}" style="color:#666">LinkedIn</a></span></p>
</div>`;
  return { subject, text, html };
}

/** A short founder note with one button, as plain text and HTML. */
function founderNote(hello: string, paras: string[], button: string, link: string) {
  const text = `${hello}

${paras.join("\n\n")}

${button}: ${link}

Vandy
Founder, JobPipe
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
${paras.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(button)}</a></p>
<p>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a> · <a href="${FOUNDER_LINKEDIN}" style="color:#666">LinkedIn</a></span></p>
</div>`;
  return { text, html };
}

/** Day 5, for people who still haven't set up after the first nudge: a personal question rather than another reminder. */
export function setupReminderEmail(p: { name?: string; email: string }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const subject = first ? `${first}, did something get stuck?` : "Did something get stuck?";
  const paras = [
    "You signed up for JobPipe but haven't uploaded your CV yet, so I wanted to ask you directly: did something get in the way?",
    "Just reply with a word or two, like \"CV upload\", \"not sure what to do\", \"found a job\" or \"not for me\". Any answer helps, and it comes straight to me.",
    "If you just haven't had the time, it takes about 5 minutes and I've kept your account ready.",
  ];
  return { subject, ...founderNote(first ? `Hi ${first},` : "Hi,", paras, "Finish setting up", `${appUrl()}/?signin=1&email=${encodeURIComponent(p.email)}`) };
}

/** Day 7, for people set up who haven't paid: 3 extra days and how to keep going. */
export function trialExtendedEmail(p: { name?: string; month: number; pass: number }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const rupees = (r: number) => `₹${r.toLocaleString("en-IN")}`;
  const subject = first ? `${first}, I've added 3 days to your JobPipe` : "I've added 3 days to your JobPipe";
  const paras = [
    "Your free week on JobPipe ended today, and job hunts rarely fit into a week, so I've added 3 more days for you.",
    "If you haven't tried it yet, star a job you like and open its tailored CV. That's where it saves the most time.",
    `After that you move to the free plan: daily jobs, your tracker, ${FREE.scoresPerDay} fit scores a day and ${FREE.tailorsPerWeek} tailored CV a week. Everything else needs a pass: ${rupees(PLANS.week)} for a week, ${rupees(p.month)} a month, or ${rupees(p.pass)} for 3 months. Nothing renews on its own.`,
    "If it isn't helping, reply and tell me what's missing. It comes straight to me, and I read every one.",
  ];
  return { subject, ...founderNote(first ? `Hi ${first},` : "Hi,", paras, "See plans", `${appUrl()}/billing`) };
}

/** Day 10: the trial is over, what still works, and how to keep going. */
export function trialEndedEmail(p: { name?: string; month: number; pass: number }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const rupees = (r: number) => `₹${r.toLocaleString("en-IN")}`;
  const subject = first ? `${first}, your JobPipe trial has ended` : "Your JobPipe trial has ended";
  const paras = [
    "Your free trial on JobPipe has ended. Your jobs, CVs and notes are all still there, and you're now on the free plan.",
    `The free plan keeps going for as long as you like: new jobs every day, your tracker, ${FREE.scoresPerDay} AI fit scores a day and ${FREE.tailorsPerWeek} tailored CV a week.`,
    `Company research, interview prep, referral notes and the chat need a pass. A week you're applying hard is ${rupees(PLANS.week)} for the Week Pass, or it's ${rupees(p.month)} a month, or ${rupees(p.pass)} for 3 months. Nothing renews on its own, and UPI works.`,
    "If the price or something else is in the way, reply and tell me. It comes straight to me.",
  ];
  return { subject, ...founderNote(first ? `Hi ${first},` : "Hi,", paras, "See the Week Pass", `${appUrl()}/billing`) };
}

/** Mondays: the week in numbers, and the one thing most worth doing next. */
export function weeklyEmail(p: { name?: string; found: number; strong: number; tailored: number; applied: number; refreshConnections: boolean }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const n = (k: number, one: string, many: string) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;
  const next = p.refreshConnections
    ? ["Your next step: refresh your LinkedIn connections. Anyone you've connected with lately won't show up on your jobs until you load a fresh file.", "Refresh connections", `${appUrl()}/network`]
    : !p.tailored
      ? ["Your next step: open your best-fit job and tailor your CV for it. That's where JobPipe saves the most time.", "See your jobs", `${appUrl()}/jobs`]
      : !p.applied
        ? ["Your next step: apply to your best job, then mark it applied so JobPipe can remind you to follow up.", "See your jobs", `${appUrl()}/jobs`]
        : ["Your next step: open Today and work through what's due.", "Open Today", appUrl()];
  const paras = [
    `This week JobPipe found you ${n(p.found, "new job", "new jobs")}${p.strong ? `, ${p.strong} of them a strong fit` : ""}.`,
    `So far you've tailored ${n(p.tailored, "CV", "CVs")} and sent ${n(p.applied, "application", "applications")}.`,
    next[0],
  ];
  return { subject: first ? `${first}, your week on JobPipe` : "Your week on JobPipe", ...founderNote(first ? `Hi ${first},` : "Hi,", paras, next[1], next[2]) };
}

/** Day 21, for people who never answered the in-app "would you recommend it?" pop-up: three questions, answered by reply. */
export function feedbackEmail(p: { name?: string }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1);
  const hello = first ? `Hi ${first},` : "Hi,";
  const subject = first ? `${first}, 3 quick questions about JobPipe` : "3 quick questions about JobPipe";
  const intro = "I know job hunting is hard right now, so I'll keep this short. You've had JobPipe for three weeks, and your answer would shape what I build next.";
  const questions = [
    "What has been most useful?",
    "What's missing, or annoying?",
    "Is it worth paying for? If not, what would make it worth it?",
  ];
  const outro = "Just hit reply. One line is plenty, and it comes straight to me.";
  const text = `${hello}

${intro}

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

${outro}

Thank you, and good luck with the search,
Vandy
Founder, JobPipe
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
<p>${esc(intro)}</p>
<ol style="padding-left:20px">${questions.map((q) => `<li style="margin-bottom:6px">${esc(q)}</li>`).join("")}</ol>
<p>${esc(outro)}</p>
<p>Thank you, and good luck with the search,<br>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a></span></p>
</div>`;
  return { subject, text, html };
}

/** The forgot-password email with its one-time code. */
export function resetEmail(code: string) {
  const subject = `${code} is your JobPipe reset code`;
  const text = `Your code to set a new JobPipe password is ${code}

Type it on the sign-in page. It works for 15 minutes.

Didn't ask for this? Ignore this email; your password stays the same.
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px">
<p>Your code to set a new JobPipe password:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${esc(code)}</p>
<p>Type it on the sign-in page. It works for 15 minutes.</p>
<p style="color:#666">Didn't ask for this? Ignore this email; your password stays the same.</p>
</div>`;
  return { subject, text, html };
}

/** The daily "new roles for you" email: each person's best new jobs, under their own role groups. */
/** A strong new role, sent as soon as it's found, because early applicants get read first. */
export function freshEmail(p: { name?: string; jobs: { id: string; title: string; company: string; where: string; fit: number }[] }) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1).toLowerCase();
  const top = p.jobs[0];
  const more = p.jobs.length - 1;
  const subject = `New: ${top.title} at ${top.company} (${top.fit}% fit)${more ? ` and ${more} more` : ""}`;
  const url = appUrl();
  const text = `${first ? `Hi ${first},` : "Hi,"}

${p.jobs.length === 1 ? "A strong match was just posted." : "Strong matches were just posted."} Applying early gives you the best chance of being read:

${p.jobs.map((j) => `- ${j.title}, ${j.company} (${j.where}), ${j.fit}% fit\n  ${url}/jobs/${j.id}`).join("\n")}

Open it to see why it fits and tailor your CV.

Vandy
Founder, JobPipe

Don't want these? Reply "stop" and I'll turn them off.
`;
  return { subject, text };
}

export function alertsEmail(p: {
  name?: string;
  groups: { track: string; jobs: { title: string; company: string; where: string; fit?: number; id: string }[] }[];
  searching?: string;
  free?: boolean;
  unsubscribeUrl?: string;
  tailor?: { title: string; company: string; fit?: number; id: string };
}) {
  const word = p.name?.trim().split(/\s+/)[0];
  const first = word && word[0].toUpperCase() + word.slice(1).toLowerCase();
  const count = p.groups.reduce((n, g) => n + g.jobs.length, 0);
  // Led by the role group with the most, like "SDR / BDR: 4 new, plus 2 more", so the subject says what's inside.
  const lead = [...p.groups].sort((a, b) => b.jobs.length - a.jobs.length)[0];
  const more = count - (lead?.jobs.length ?? 0);
  const subject = lead
    ? `${first ? `${first}, ` : ""}${lead.track}: ${lead.jobs.length} new ${lead.jobs.length === 1 ? "role" : "roles"}${more ? ` + ${more} more` : ""}`
    : `${count} new roles for you today`;
  const url = appUrl();
  const line = (j: { title: string; company: string; where: string; fit?: number }) => `${j.title}, ${j.company} (${j.where})${j.fit !== undefined ? ` · fit ${j.fit}` : ""}`;
  const where = p.searching ? `Searching: ${p.searching}. Change it on your Roles page.` : "";
  const upsell = p.free ? `On the free plan, ${FREE.scoresPerDay} of these get an AI score a day. The Week Pass (₹${PLANS.week}) scores them all and writes a tailored CV for each.` : "";
  const stop = p.unsubscribeUrl ? `Don't want these? Unsubscribe in one click: ${p.unsubscribeUrl}` : `Don't want these? Reply "stop" and I'll turn them off.`;
  const text = `${first ? `Hi ${first},` : "Hi,"}

${p.tailor ? `Your best fit so far: ${p.tailor.title} at ${p.tailor.company}${p.tailor.fit !== undefined ? ` (fit ${p.tailor.fit})` : ""}. Tailor your CV for it, about a minute: ${url}/jobs/${p.tailor.id}\n\n` : ""}New roles matching your titles since yesterday, best first:

${p.groups.map((g) => `${g.track} (${g.jobs.length} new)\n${g.jobs.map((j) => `- ${line(j)}\n  ${url}/jobs/${j.id}`).join("\n")}`).join("\n\n")}

Open one to see why it fits, tailor your CV and find who to ask for an intro.
${where ? `\n${where}\n` : ""}${upsell ? `\n${upsell} ${url}/billing\n` : ""}
All your roles: ${url}/jobs

Vandy
Founder, JobPipe

${stop}
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(first ? `Hi ${first},` : "Hi,")}</p>
${p.tailor ? `<p style="background:#f4ffe0;border-radius:8px;padding:10px 14px">Your best fit so far: <b>${esc(p.tailor.title)}</b> at ${esc(p.tailor.company)}${p.tailor.fit !== undefined ? ` (fit ${p.tailor.fit})` : ""}. <a href="${esc(`${url}/jobs/${p.tailor.id}`)}" style="color:#1a1a1a;font-weight:600">Tailor your CV for it</a>, about a minute.</p>` : ""}
<p>New roles matching your titles since yesterday, best first:</p>
${p.groups
  .map(
    (g) => `<p style="margin:20px 0 6px;font-weight:600">${esc(g.track)} <span style="color:#666;font-weight:400">(${g.jobs.length} new)</span></p>
<ul style="margin:0;padding-left:18px">${g.jobs.map((j) => `<li style="margin:4px 0"><a href="${esc(`${url}/jobs/${j.id}`)}" style="color:#1a1a1a;font-weight:600">${esc(j.title)}</a>, ${esc(j.company)} <span style="color:#666">(${esc(j.where)})${j.fit !== undefined ? ` · fit ${j.fit}` : ""}</span></li>`).join("")}</ul>`,
  )
  .join("\n")}
<p>Open one to see why it fits, tailor your CV and find who to ask for an intro.</p>
${where ? `<p style="color:#666;font-size:13px">${esc(where)}</p>` : ""}
${upsell ? `<p style="background:#f4ffe0;border-radius:8px;padding:10px 14px">${esc(upsell)} <a href="${esc(`${url}/billing`)}" style="color:#1a1a1a;font-weight:600">Get the Week Pass</a></p>` : ""}
<p style="margin:24px 0"><a href="${esc(`${url}/jobs`)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">See all your roles</a></p>
<p>Vandy<br><span style="color:#666">Founder, <a href="${url}" style="color:#666">JobPipe</a></span></p>
<p style="color:#999;font-size:12px">${p.unsubscribeUrl ? `Don't want these? <a href="${esc(p.unsubscribeUrl)}" style="color:#999">Unsubscribe in one click</a>.` : `Don't want these? Reply "stop" and I'll turn them off.`}</p>
</div>`;
  return { subject, text, html };
}

const STYLE = "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px";

type PartnerPerson = { email: string; firstName?: string; name: string; url: string; signedUp: boolean };

/** Where a partner email sends them: sign in if they have an account, otherwise create one, with their email filled in. */
function partnerLink(p: PartnerPerson) {
  return `${appUrl()}/?${p.signedUp ? "signin=1&" : ""}email=${encodeURIComponent(p.email)}`;
}

/** The welcome email for people given JobPipe through a partner deal, from the founder. */
export function partnerWelcomeEmail(p: PartnerPerson) {
  const first = p.firstName?.trim();
  const link = partnerLink(p);
  const hello = first ? `Hi ${first},` : "Hi,";
  const subject = first ? `${first}, your ${p.name} job hunt starts here` : `Your ${p.name} job hunt starts here`;
  const intro = [
    `I'm Vandy. I built JobPipe, and I'm really glad to have you here. We've partnered with ${p.name} because we care about the same thing: getting good people into great SaaS sales roles. Your JobPipe access is part of your ${p.name} journey.`,
    "You've spent the last few weeks learning how to prospect: find the right accounts, research them, and reach out with something worth replying to. Now it's time to point that at your own search. Your next role is the account.",
    "JobPipe does the groundwork so you can focus on reaching out:",
  ];
  const does = [
    "Finds new SDR and BDR roles every day and scores each one against your CV, with the reason",
    "Tailors your CV to a job without making anything up",
    "Shows who you know at each company, so you can go in through a person and not the apply button",
  ];
  const steps = [
    p.signedUp ? `Sign in with ${p.email}: ${link}` : `Create your account with ${p.email}: ${link}`,
    "Upload your CV",
    "Pick the roles you're going after",
  ];
  const after = [
    "Once your roles are in, I'll email you when a strong new match turns up, often within hours of it going live.",
    "If anything feels off, reply here. It comes straight to me.",
    "All the best for the hunt. Go get picked.",
  ];
  const text = `${hello}

${intro.join("\n\n")}
${does.map((d) => `- ${d}`).join("\n")}

Getting set up takes about 5 minutes:
${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

${after.join("\n\n")}

Vandy
Founder, JobPipe
In partnership with ${p.name} (${p.url})
`;
  const html = `<div style="${STYLE}">
<p>${esc(hello)}</p>
${intro.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<ul style="padding-left:20px">${does.map((d) => `<li style="margin-bottom:6px">${esc(d)}</li>`).join("")}</ul>
<p><b>Getting set up takes about 5 minutes:</b></p>
<ol style="padding-left:20px">${steps.map((s) => `<li style="margin-bottom:6px">${esc(s.replace(`: ${link}`, ""))}</li>`).join("")}</ol>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">${p.signedUp ? "Open JobPipe" : "Create my account"}</a></p>
${after.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<p>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a><br>In partnership with <a href="${esc(p.url)}" style="color:#666">${esc(p.name)}</a></span></p>
</div>`;
  return { subject, text, html };
}

/** Three days after the partner welcome, for anyone who hasn't created their account yet. */
export function partnerReminderEmail(p: PartnerPerson) {
  const first = p.firstName?.trim();
  const link = partnerLink(p);
  const hello = first ? `Hi ${first},` : "Hi,";
  const subject = first ? `${first}, your JobPipe account is waiting` : "Your JobPipe account is waiting";
  const body = [
    `Quick nudge: your JobPipe access from ${p.name} is ready, but your account isn't set up yet.`,
    "It takes about 5 minutes. Create your account, upload your CV, pick your roles, and new SDR and BDR jobs start coming in, scored against your CV.",
    "Stuck on anything? Reply here and I'll help.",
  ];
  const text = `${hello}

${body[0]}

${body[1]}

Create your account with ${p.email}: ${link}

${body[2]}

Vandy
Founder, JobPipe
`;
  const html = `<div style="${STYLE}">
<p>${esc(hello)}</p>
<p>${esc(body[0])}</p>
<p>${esc(body[1])}</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Create my account</a></p>
<p>${esc(body[2])}</p>
<p>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a></span></p>
</div>`;
  return { subject, text, html };
}

/** The link that stops jobs emails in one click, and the headers that let Gmail show its own Unsubscribe button. */
export function unsubscribeLink(key: string) {
  const url = `${appUrl()}/unsubscribe?k=${encodeURIComponent(key)}`;
  return { url, headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

type SubJob = { title: string; company: string; where: string; url: string };

/**
 * The jobs email for people without an account: roles grouped under the titles they picked, straight to each
 * company's own posting, and one line on what an account adds. `first` is the email sent the moment they sign up.
 */
export function subscriberEmail(p: { email: string; place: string; groups: { title: string; jobs: SubJob[] }[]; unsubscribeUrl: string; first?: boolean }) {
  const count = p.groups.reduce((n, g) => n + g.jobs.length, 0);
  const where = /^(anywhere|india)$/i.test(p.place) ? "in India" : /^remote$/i.test(p.place) ? "remote and open to India" : `in ${p.place}`;
  const lead = p.groups.find((g) => g.jobs.length) ?? p.groups[0];
  const more = count - (lead?.jobs.length ?? 0);
  const subject = p.first
    ? count
      ? `${count} open sales ${count === 1 ? "job" : "jobs"} to start with`
      : "You're signed up for new sales jobs"
    : `${lead.title}: ${lead.jobs.length} new ${lead.jobs.length === 1 ? "job" : "jobs"}${more ? `, plus ${more} more` : ""}`;
  const intro = p.first
    ? count
      ? `You're signed up. Here are open jobs for your titles, ${where}, right now. From tomorrow you'll only get new ones, once a day.`
      : `You're signed up. Nothing open ${where} matches your titles right now, so I'll email you as soon as a new one appears.`
    : `New sales jobs for your titles, ${where}, since yesterday, straight from each company's careers page:`;
  const signUp = `${appUrl()}/?email=${encodeURIComponent(p.email)}`;
  const pitch = "Want each job scored against your CV, and your CV tailored for it in one click? That's what a free JobPipe account does. Try it free for 7 days:";
  const groups = p.groups.filter((g) => g.jobs.length);
  const text = `Hi,

${intro}

${groups.map((g) => `${g.title} (${g.jobs.length})\n${g.jobs.map((j) => `- ${j.title}, ${j.company} (${j.where})\n  ${j.url}`).join("\n")}`).join("\n\n")}${groups.length ? "\n\n" : ""}${pitch} ${signUp}

Vandy
Founder, JobPipe

You signed up for these at jobpipe.in. Unsubscribe in one click: ${p.unsubscribeUrl}
`;
  const html = `<div style="${STYLE}">
<p>Hi,</p>
<p>${esc(intro)}</p>
${groups
  .map(
    (g) => `<p style="margin:20px 0 6px;font-weight:600">${esc(g.title)} (${g.jobs.length})</p>
<ul style="margin:0;padding-left:18px">${g.jobs.map((j) => `<li style="margin:4px 0"><a href="${esc(j.url)}" style="color:#1a1a1a;font-weight:600">${esc(j.title)}</a>, ${esc(j.company)} <span style="color:#666">(${esc(j.where)})</span></li>`).join("")}</ul>`,
  )
  .join("\n")}
<p style="margin-top:24px">${esc(pitch)}</p>
<p style="margin:16px 0 24px"><a href="${esc(signUp)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Try JobPipe free</a></p>
<p>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a></span></p>
<p style="color:#999;font-size:12px">You signed up for these at jobpipe.in. <a href="${esc(p.unsubscribeUrl)}" style="color:#999">Unsubscribe in one click</a>.</p>
</div>`;
  return { subject, text, html };
}

/**
 * Two days after a free CV review, once: their score, five open roles for the role they picked, and why each
 * job needs its own version of the CV. Signed by the founder; replies come to her.
 */
export function cvFollowUpEmail(p: { role: string; score: number; jobs: { title: string; company: string; where: string; url: string }[] }) {
  const subject = p.jobs.length ? `Your CV review, and ${p.jobs.length} ${p.role} roles open now` : "Your CV review: the next step";
  const link = `${appUrl()}/?signin=1`;
  const intro = [
    `Recently you had your CV reviewed on JobPipe for ${p.role} roles. It scored ${p.score} out of 100.`,
    "Fixing the CV is step one. Step two is a version of it for each job: hiring managers look for their own words, so the same CV sent everywhere gets passed over.",
  ];
  const listIntro = p.jobs.length ? `Here are ${p.jobs.length} ${p.role} roles open in India right now:` : "";
  const outro = [
    "JobPipe finds roles like these every morning, scores each against your CV, and writes a version of your CV for each job. It's free to start.",
    "This is the only follow-up I'll send about your review. If you have a question, just reply: it comes to me.",
  ];
  const text = `Hi,

${intro.join("\n\n")}
${listIntro ? `\n${listIntro}\n\n${p.jobs.map((j) => `- ${j.title} at ${j.company} (${j.where})\n  ${j.url}`).join("\n")}\n` : ""}
${outro.join("\n\n")}

Start free: ${link}

Vandy
Founder, JobPipe
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>Hi,</p>
${intro.map((t) => `<p>${esc(t)}</p>`).join("\n")}
${listIntro ? `<p>${esc(listIntro)}</p>\n<ul style="padding-left:18px">${p.jobs.map((j) => `<li style="margin-bottom:6px"><a href="${esc(j.url)}" style="color:#1a1a1a;font-weight:600">${esc(j.title)}</a> at ${esc(j.company)} <span style="color:#666">(${esc(j.where)})</span></li>`).join("")}</ul>` : ""}
${outro.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Start free</a></p>
<p>Vandy<br><span style="color:#666">Founder, <a href="${appUrl()}" style="color:#666">JobPipe</a> · <a href="${FOUNDER_LINKEDIN}" style="color:#666">LinkedIn</a></span></p>
</div>`;
  return { subject, text, html };
}

/**
 * A short hand-written note from the founder as a proper email: paragraphs as written (no breaks mid-sentence),
 * numbered lines ("1. ...") as a list with the optional button right under it, a leading "One step left:"-style
 * label in bold, and a closing "Vandy" turned into a compact signature with the JobPipe name in its colours
 * (text, not an image, so every inbox shows it).
 */
export function noteEmail(text: string, button?: { label: string; url: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  const signed = /^vandy$/i.test((blocks[blocks.length - 1] ?? "").trim());
  type Block = { list: string[] } | { para: string };
  const body: Block[] = (signed ? blocks.slice(0, -1) : blocks).flatMap((b): Block[] => {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => /^\d+\.\s/.test(l))) return [{ list: lines.map((l) => l.replace(/^\d+\.\s+/, "")) }];
    return [{ para: lines.join(" ") }];
  });
  const url = appUrl();
  const line = (p: string) => {
    const m = p.match(/^([A-Z][^:.?!]{0,20}:)\s(.*)$/);
    return m ? `<b>${esc(m[1])}</b> ${esc(m[2])}` : esc(p);
  };
  const btn = button ? `<p style="margin:4px 0 18px"><a href="${esc(button.url)}" style="background:#c6ff3d;color:#0b0b0f;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(button.label)}</a></p>` : "";
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:#1a1a1a;max-width:520px">
${body
  .map((b) =>
    "list" in b
      ? `<ol style="margin:0 0 14px;padding-left:22px">${b.list.map((l) => `<li style="margin:0 0 6px">${line(l)}</li>`).join("")}</ol>${btn}`
      : `<p style="margin:0 0 12px">${line(b.para)}</p>`,
  )
  .join("\n")}
${body.some((b) => "list" in b) ? "" : btn}
<div style="margin-top:22px;border-top:1px solid #e6e6e6"></div>
<table cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
<td style="padding:0 12px 0 0;vertical-align:middle"><a href="${url}" style="text-decoration:none;font-weight:800;letter-spacing:1px;font-size:12px;color:#ffffff;background:#0b0b0f;padding:5px 8px;border-radius:5px;white-space:nowrap">JOBPIPE<span style="color:#c6ff3d">.</span></a></td>
<td style="vertical-align:middle;font-size:14px;line-height:1.3"><b>Vandy</b><br><span style="color:#777;font-size:12px">Founder, <a href="${url}" style="color:#777">jobpipe.in</a> &middot; <a href="${FOUNDER_LINKEDIN}" style="color:#777">LinkedIn</a></span></td>
</tr></table>
</div>`;
  const plainBody = body.map((b) => ("list" in b ? b.list.map((l, i) => `${i + 1}. ${l}`).join("\n") : b.para)).join("\n\n");
  const plain = `${plainBody}${button ? `\n\n${button.label}: ${button.url}` : ""}\n\nVandy\nFounder, JobPipe\n${url}`;
  return { text: plain, html };
}
