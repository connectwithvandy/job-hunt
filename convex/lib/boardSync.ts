import type { CareerJob } from "./careers";
import { AGGREGATORS } from "./company";
import { openTo, readPlace, titleMatches } from "./sources";

const INDIA = readPlace("India");

/**
 * What one board read changes in the shared table: roles to add (new, or saved ones whose link moved) and roles to
 * take out (saved but no longer listed). Pure, so the Convex read (careersRefresh.syncBoard) and the GitHub read
 * (scripts/careers-runner.ts, since 28 Nov 2026) decide the same way.
 */
export function boardChanges(
  boardName: string,
  read: (CareerJob | { externalId: string; known: true })[],
  saved: { externalId: string; url: string }[],
  titles: string[],
) {
  const have = new Set(saved.map((s) => s.externalId));
  const linkOf = new Map(saved.map((s) => [s.externalId, s.url]));
  // Workday roles already saved come back as ids only; they're still open.
  const stillOpen = read.filter((j) => "known" in j).map((j) => j.externalId);
  // Only roles in India or remote, with a title someone's tracks ask for; the rest drop out on the next run.
  const jobs = (AGGREGATORS.test(boardName) ? [] : read)
    .filter((j): j is CareerJob => !("known" in j))
    .map((j) => ({ ...j, india: openTo(INDIA, j.location, j.workSetting, j.title) }))
    .filter((j) => j.india || j.workSetting === "remote" || /remote|distributed/i.test(j.location))
    .filter((j) => titles.some((t) => titleMatches(t, j.title)));
  const live = new Set([...jobs.map((j) => j.externalId), ...stillOpen]);
  const fresh = jobs.filter((j) => !have.has(j.externalId) || linkOf.get(j.externalId) !== j.url);
  const gone = [...have].filter((id) => !live.has(id));
  return { fresh, gone };
}
