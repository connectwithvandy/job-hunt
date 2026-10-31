// Sends email through Resend (resend.com, free up to 3,000 a month) from hello@jobpipe.in.
// Off when RESEND_API_KEY is missing: the waitlist page then falls back to opening your own email app.

import { env } from "../_generated/server";

export const FROM = "Vandy from JobPipe <hello@jobpipe.in>";
export const REPLY_TO = "hello@jobpipe.in";

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
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
${story.map((t) => `<p>${esc(t)}</p>`).join("\n")}
<p><b>Getting started takes about 5 minutes:</b></p>
<ol style="padding-left:20px">${steps.map((s) => `<li style="margin-bottom:6px">${esc(s)}</li>`).join("")}</ol>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open JobPipe</a></p>
<p>${esc(outro)}</p>
<p>Good luck with the hunt,<br>Vandy<br><span style="color:#666">Founder, <a href="${url}" style="color:#666">JobPipe</a></span></p>
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
