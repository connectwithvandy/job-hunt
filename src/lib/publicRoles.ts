import { cachedQuery } from "./guideRoles";
import { tidyPlace } from "./tidy";
import { titleElsewhere } from "./regions";
import { CITIES } from "../../convex/lib/publicRole";
import { junkCompany, sameRoleKey, storeRetailJob } from "../../convex/lib/company";

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
/** One role posted twice (two boards, or once per city) shows once: the first, newest, copy (27 Nov review). */
const onceEach = (roles: PublicRole[]) =>
  [...new Map(roles.filter((r) => !junkCompany(r.company) && !storeRetailJob(r)).map((r) => [sameRoleKey(r.company, r.title), r] as const).reverse()).values()].reverse();

export const rolesInCity = (city: string) =>
  cachedQuery<PublicRole[]>("publicRoles:inCity", { city })
    .then((roles) => onceEach(roles).filter((r) => city === "remote" || !titleElsewhere(r.title, CITIES.find((c) => c.slug === city)?.name ?? city)))
    .catch(() => [] as PublicRole[]);
export const rolesAtCompany = (companySlug: string) => cachedQuery<PublicRole[]>("publicRoles:atCompany", { companySlug }).then(onceEach).catch(() => [] as PublicRole[]);

/** "Bengaluru · hybrid": the place written one way ("India - Bangalore" and "Bangalore, India" both read "Bengaluru"). */
export const placeOf = (r: { location: string; workSetting?: string }) => {
  const raw = r.location.split(";")[0].trim();
  const place = tidyPlace(raw) || raw;
  return [place, r.workSetting && !place.toLowerCase().includes(r.workSetting.toLowerCase()) ? r.workSetting : null].filter(Boolean).join(" · ");
};

/** Companies with the most open roles, for a page's "who's hiring" line. */
export function topCompanies(roles: { company: string }[], n: number) {
  const count = new Map<string, number>();
  for (const r of roles) count.set(r.company, (count.get(r.company) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
