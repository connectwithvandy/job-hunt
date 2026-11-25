// Shared by the backend and the website: how a public role page is named and grouped.
// The code is the same as src/lib/guideRoles roleCode, so role links made before 25 Nov 2026 keep working.

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");

/** "/sales-jobs/role/sales-development-representative-at-rippling-3f9a1c2b7e" */
export const publicRoleHref = (title: string, company: string, code: string) => `/sales-jobs/role/${slugify(`${title} at ${company}`) || "role"}-${code}`;

/** The first 10 hex characters of the SHA-1 of the role's id, as roleCode on the website. */
export async function publicRoleCode(externalId: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(externalId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

/** The city pages, and the words in a location that put a role on each. */
export const CITIES: { slug: string; name: string; words: RegExp }[] = [
  { slug: "bengaluru", name: "Bengaluru", words: /\b(bengaluru|bangalore|karnataka)\b/i },
  { slug: "mumbai", name: "Mumbai", words: /\b(mumbai|navi mumbai|thane)\b/i },
  { slug: "delhi-ncr", name: "Delhi NCR", words: /\b(delhi|new delhi|ncr|gurugram|gurgaon|noida|faridabad|ghaziabad)\b/i },
  { slug: "hyderabad", name: "Hyderabad", words: /\b(hyderabad|secunderabad|telangana)\b/i },
  { slug: "pune", name: "Pune", words: /\bpune\b/i },
  { slug: "chennai", name: "Chennai", words: /\b(chennai|tamil nadu)\b/i },
  { slug: "remote", name: "Remote (India)", words: /\bremote\b/i },
];

export function cityOf(location: string, workSetting?: string) {
  if (workSetting === "remote") return "remote";
  return CITIES.find((c) => c.words.test(location))?.slug ?? "";
}

/** The kinds of sales role the city pages group by. */
export const FAMILIES = { sdr: "SDR and BDR", ae: "Account Executive", manager: "Sales managers and leaders", am: "Account managers", other: "Other sales roles" } as const;
export type Family = keyof typeof FAMILIES;
