import { cachedQuery } from "./guideRoles";

// Open sales roles in India and remote, one page each (convex/publicRoles.ts). Read through the 6-hour cache.
export type PublicRole = {
  code: string;
  externalId: string;
  company: string;
  companySlug: string;
  title: string;
  location: string;
  workSetting?: string;
  postedAt?: string;
  url: string;
  city: string;
  family: string;
  href: string;
};
export type PublicRoleShort = { href: string; postedAt?: string; city: string; companySlug: string; company: string };

export const allPublicRoles = () => cachedQuery<PublicRoleShort[]>("publicRoles:all", {}).catch(() => [] as PublicRoleShort[]);
export const rolesInCity = (city: string) => cachedQuery<PublicRole[]>("publicRoles:inCity", { city }).catch(() => [] as PublicRole[]);
export const rolesAtCompany = (companySlug: string) => cachedQuery<PublicRole[]>("publicRoles:atCompany", { companySlug }).catch(() => [] as PublicRole[]);

/** "Bengaluru · hybrid" */
export const placeOf = (r: { location: string; workSetting?: string }) => {
  const place = r.location.split(";")[0].trim();
  return [place, r.workSetting && !place.toLowerCase().includes(r.workSetting.toLowerCase()) ? r.workSetting : null].filter(Boolean).join(" · ");
};

/** Companies with the most open roles, for a page's "who's hiring" line. */
export function topCompanies(roles: { company: string }[], n: number) {
  const count = new Map<string, number>();
  for (const r of roles) count.set(r.company, (count.get(r.company) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
