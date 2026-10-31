// Sends email through Resend (resend.com, free up to 3,000 a month) from hello@jobpipe.in.
// Off when RESEND_API_KEY is missing: the waitlist page then falls back to opening your own email app.

import { env } from "../_generated/server";

export const FROM = "JobPipe <hello@jobpipe.in>";
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

/** The "you're in" email, built from what they told us on the waitlist. */
export function welcomeEmail(p: { name?: string; role?: string; email: string }) {
  const first = p.name?.trim().split(/\s+/)[0];
  const url = appUrl();
  const role = p.role?.trim();
  const steps = [
    `Sign in at ${url} with ${p.email} and the password you picked.`,
    "Upload your CV. A PDF is fine, Canva ones too.",
    role ? `Add "${role}" as your first role (you told us that's what you're after). Add more if you're open to others.` : "Pick the roles you're after. You can add more than one.",
    "Open Today each morning: new jobs scored against your CV, follow-ups due, and who you know at each company.",
  ];
  const subject = first ? `${first}, you're in: JobPipe` : "You're in: JobPipe";
  const hello = first ? `Hi ${first},` : "Hi,";
  const intro = role
    ? `You're off the waitlist. JobPipe is ready to start hunting ${role} roles for you.`
    : "You're off the waitlist. JobPipe is ready to start hunting for you.";
  const outro =
    "You're one of the first people in, so things will break now and then. Tell me when they do: reply to this email or use \"Send feedback\" in the app. I read every one.";
  const text = `${hello}

${intro}

Getting started takes about 5 minutes:
${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

${outro}

JobPipe
${url}
`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px">
<p>${esc(hello)}</p>
<p>${esc(intro)}</p>
<p><b>Getting started takes about 5 minutes:</b></p>
<ol style="padding-left:20px">${steps.map((s) => `<li style="margin-bottom:6px">${esc(s)}</li>`).join("")}</ol>
<p style="margin:24px 0"><a href="${url}" style="background:#c6ff3d;color:#0b0b0f;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open JobPipe</a></p>
<p>${esc(outro)}</p>
<p style="color:#666">JobPipe<br><a href="${url}" style="color:#666">${esc(url.replace(/^https?:\/\//, ""))}</a></p>
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
