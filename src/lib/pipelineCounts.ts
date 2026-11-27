import type { Doc } from "../../convex/_generated/dataModel";
import { junkCompany, sameRoleKey, storeRetailJob } from "../../convex/lib/company";
import { SKIP_BELOW } from "../../convex/lib/posting";
import { bestScore } from "@/components/bits";
import { isArchived } from "@/lib/archive";

type CountJob = Pick<Doc<"jobs">, "_id" | "status" | "company" | "title" | "scores" | "liveCheck" | "postedAt" | "_creationTime">;

/**
 * Prospect and Qualified, counted one way for Today's strip, the Applications board and the Jobs header (27 Nov
 * review: the pages disagreed). Prospect = every open job (not applied, still live, broken listings out, one role on
 * two boards once): the same number as Jobs' "open". Qualified = those with a real fit of 60+.
 */
export function openStages(jobs: CountJob[], now: number, maxAgeDays?: number) {
  const open = [
    ...new Map(
      jobs
        .filter((j) => (j.status === "new" || j.status === "applying") && !isArchived(j as Parameters<typeof isArchived>[0], now, maxAgeDays) && !junkCompany(j.company) && !storeRetailJob(j))
        .map((j) => [sameRoleKey(j.company, j.title), j]),
    ).values(),
  ];
  const qualified = open.filter((j) => (bestScore(j)?.score ?? -1) >= SKIP_BELOW).length;
  return { prospect: open.length, qualified };
}
