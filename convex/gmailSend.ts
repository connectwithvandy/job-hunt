"use node";
// Sends one email from the owner's Google Workspace mailbox (vandana@jobpipe.in) over Gmail's SMTP, with an app
// password. Since 28 Nov 2026 paying and partner members' daily new-roles emails go this way: few a day, to people
// who know her, from a real mailbox. Everyone else stays on Resend (lib/email.ts), whose free 100 a day was being
// used up. Callers schedule these 10 minutes apart, so Google never sees a burst from the mailbox. If Google
// refuses, the email goes through Resend instead.
import { v } from "convex/values";
import nodemailer from "nodemailer";
import { env, internalAction } from "./_generated/server";
import { FROM, REPLY_TO, sendEmail } from "./lib/email";

export const send = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string(), html: v.optional(v.string()), headers: v.optional(v.record(v.string(), v.string())) },
  returns: v.null(),
  handler: async (_ctx, msg) => {
    const pass = env.GMAIL_APP_PASSWORD;
    if (pass) {
      try {
        const mailer = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: REPLY_TO, pass } });
        await mailer.sendMail({ from: FROM, replyTo: REPLY_TO, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers });
        return null;
      } catch (err) {
        console.warn("Google refused an email, sending through Resend:", String(err).slice(0, 200));
      }
    }
    await sendEmail(msg);
    return null;
  },
});
