// How the morning search spends Dreamwork's 500 requests a day (from 23 Nov). On 24 Nov it needed ~766 (116 titles in
// 9 places, up to 4 pages each, twice a day), ran out by 9am, and 4 people got short searches. Two savings, measured
// on that day's saved searches:
// - In a city, the broad title finds the narrow ones: "Account Executive" in Bengaluru already holds every
//   "Enterprise Account Executive" there (8 of 950 city jobs lost, all from searching "SDR" instead of the full name,
//   which quotaTitles fixes). In India, Remote and Anywhere the broad title fills its 100 and the narrow ones add
//   ~2,300 more, so there every title is still searched.
// - After the first search, only listings Dreamwork first saw since the last one are asked for (addedAfter), and
//   they're added to the saved list: one page instead of four for almost every title and place.

import { coreTitles } from "./salesRoles";
import { quotaTitles } from "./sources";

/** Places so wide that a broad title's 100 results crowd out the narrow titles' jobs. */
const WIDE = new Set(["", "india", "remote", "anywhere"]);

/** The titles worth a Dreamwork search for one role in one place (at most 16, as before). */
export function dreamworkTitles(titles: string[], place: string) {
  const full = quotaTitles(titles);
  return (WIDE.has(place.trim().toLowerCase()) ? full : coreTitles(full)).slice(0, 16);
}

/** Days a listing stays in the saved list, the same as the search's own postedWithinDays. */
const KEEP_DAYS = 30;
/** Most listings kept per title and place, so the saved row and each member's save stay small. */
export const KEEP_MAX = 300;

type Saved = { id: string; postedAt?: string | null; firstSeenAt?: string };

/** New listings first, then the saved ones not repeated and not older than 30 days. */
export function mergeListings<T extends Saved>(fresh: T[], saved: T[], now: number): T[] {
  const cutoff = now - KEEP_DAYS * 86_400_000;
  const recent = (l: T) => {
    const at = Date.parse(l.postedAt ?? l.firstSeenAt ?? "");
    return Number.isNaN(at) || at >= cutoff;
  };
  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of [...fresh, ...saved]) {
    if (seen.has(l.id) || !recent(l)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out.slice(0, KEEP_MAX);
}

/** A saved list older than this is searched again in full rather than topped up. */
export const TOP_UP_WITHIN_MS = 7 * 86_400_000;
/** Asks for a little before the last search, so a listing added while it ran isn't missed. */
export const TOP_UP_OVERLAP_MS = 3_600_000;
