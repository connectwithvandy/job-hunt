// The thank-you note after an interview, from a template: no AI, so it costs nothing and can't make claims.
// It says thanks, names the role, and offers to send anything else. Nothing about the conversation itself,
// because JobPipe wasn't there and mustn't invent what was said.

/** "Timothy Joseph <timothy.joseph@rippling.com>" as "Timothy". Empty for no-reply senders and bare addresses. */
export function interviewerFirstName(from: string): string {
  const name = from.replace(/<[^>]*>/, "").replace(/["']/g, "").trim();
  if (!name || /@/.test(name) || /(no-?reply|team|talent|recruiting|careers|hiring|notifications?)/i.test(name)) return "";
  return name.split(/\s+/)[0];
}

export function thankYouNote(o: { interviewer: string; company: string; role: string; myName: string }): { subject: string; body: string } {
  const hello = o.interviewer ? `Hi ${o.interviewer},` : "Hello,";
  const me = o.myName.split(/\s+/)[0] || "";
  return {
    subject: `Thank you – ${o.role}`,
    body: [
      hello,
      "",
      `Thank you for your time for the ${o.role} role at ${o.company}. I appreciated the chance to talk about the role and the team.`,
      "",
      `I'm keen on the role. If anything else would help from my side, I'm happy to share it.`,
      "",
      "Best regards,",
      me,
    ]
      .join("\n")
      .trim(),
  };
}
