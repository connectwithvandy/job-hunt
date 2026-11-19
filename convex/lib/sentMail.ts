// Matches emails from the Sent folder to HR and hiring-manager contacts, so a message sent from Gmail counts as sent
// without anyone ticking a box. Pure, so it's tested without Gmail.

/** For each contact whose address appears in a sent email's To or Cc, the earliest time it was sent to them. */
export function sentToContacts<J>(
  contacts: { jobId: J; contactId: string; email: string }[],
  sent: { to: string; at: number }[],
): { jobId: J; contactId: string; at: number }[] {
  const out: { jobId: J; contactId: string; at: number }[] = [];
  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    if (!email.includes("@")) continue;
    // Whole addresses only: "sam@acme.com" mustn't match "pam@acme.com.au" or "xsam@acme.com".
    const hit = sent
      .filter((m) => m.to.toLowerCase().split(/[\s,;<>"]+/).includes(email))
      .sort((a, b) => a.at - b.at)[0];
    if (hit) out.push({ jobId: c.jobId, contactId: c.contactId, at: hit.at });
  }
  return out;
}
