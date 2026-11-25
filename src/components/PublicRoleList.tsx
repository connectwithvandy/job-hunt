import Link from "next/link";
import { placeOf, type PublicRole } from "@/lib/publicRoles";

/** A plain list of open roles, each linking to its own page. */
export function PublicRoleList({ roles, showCompany = true }: { roles: PublicRole[]; showCompany?: boolean }) {
  return (
    <ul className="mt-4 divide-y divide-line border-y border-line">
      {roles.map((j) => (
        <li key={j.code}>
          <Link href={j.href} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 hover:text-accent">
            <span className="font-medium">
              {j.title} {showCompany && <span className="font-normal text-ink-2">at {j.company}</span>}
            </span>
            <span className="text-sm text-ink-3">{placeOf(j)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
