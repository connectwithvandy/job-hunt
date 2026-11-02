// Sends email through Resend (resend.com, free up to 3,000 a month) from hello@jobpipe.in.
// Off when RESEND_API_KEY is missing: the waitlist page then falls back to opening your own email app.

import { env } from "../_generated/server";

export const FROM = "Vandy from JobPipe <hello@jobpipe.in>";
export const REPLY_TO = "hello@jobpipe.in";
const FOUNDER_LINKEDIN = "https://www.linkedin.com/in/meet-vandana/";

export const emailOn = () => !!env.RESEND_API_KEY;

export const appUrl = () => (env.APP_URL ?? "https://jobpipe.in").replace(/\/$/, "");

/** Sends one email. Throws with Resend's reason when it fails. */
export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }) {
  if (!env.RESEND_API_KEY) throw new Error("Email is off: RESEND_API_KEY isn't set.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) throw new Error(`Resend said ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
        `If it's saving you time, you can keep going for ${rupees(p.month)} a month, or ${rupees(p.pass)} for 3 months. Nothing renews on its own, and UPI works: ${url}/billing`,
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
  const a = /^[aeiou]/i.test(p.title) ? "an" : "a";
  const win = p.offer ? `I've got an offer for ${a} ${p.title} role.` : `I've got an interview lined up for ${a} ${p.title} role.`;
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
      ? `Looks like an offer came through for the ${p.title} role. Huge congratulations!`
      : `Looks like you've got an interview for the ${p.title} role. Congratulations, and good luck!`,
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
