// The owner's own account and her test accounts aren't members, so they stay out of the platform's numbers
// (19 Nov: "remove my stats from platform"). Shared by the backend funnel and the Admin page.

/** "me+test1@gmail.com" is "me@gmail.com" with a tag: same inbox, same person. */
function base(email: string) {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

/** True for an owner address, any +tagged copy of one, and throwaway test domains. */
export function isInternalAccount(email: string | undefined, owners: string[]): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (/@(example\.(com|org|net)|test\.com)$/.test(e)) return true;
  const mine = new Set(owners.filter(Boolean).map(base));
  return mine.has(base(e));
}
