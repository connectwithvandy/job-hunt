"use node";

// Builds the weekly India Sales Hiring Index from the shared careers-board roles (see lib/hiringIndex.ts for what it shows).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { CITY_CHOICES, jobMode } from "./lib/defaults";
import { buildIndex, cleanCompany, mergeCompanies, type IndexRole } from "./lib/hiringIndex";
import { roleKey } from "./lib/company";
import { SALES_ROLES, trackForTitle } from "./lib/salesRoles";
import { openTo, readPlace } from "./lib/sources";

/** Job boards that repost other companies' roles aren't employers (as on the guides). */
const AGGREGATORS = /\b(jobgether|bebee|talent\.com|jooble|careerjet)\b/i;
/** Recruitment agencies post for their clients, and a bare legal word isn't a company name: neither goes on a public page. */
const NOT_EMPLOYER = /\b(hr solutions|hr services|human resources|hiring solutions|staffing|placements?|recruit\w*|consultan\w*|manpower|headhunt\w*|talent solutions|search partners|2coms)\b|hire$/i;
const BAD_NAME = /^(llp|pvt|pvt ltd|ltd|inc|limited|private limited|company|careers?)$/i;
const CITIES = [...CITY_CHOICES, "Remote"];

/** Monday of this week in India, like "2026-11-16": the snapshot's name. */
function weekOf(now: number) {
  const ist = new Date(now + 19_800_000);
  ist.setUTCDate(ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7));
  return ist.toISOString().slice(0, 10);
}

export const build = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { dryRun }) => {
    const now = Date.now();
    const places = CITY_CHOICES.map((c) => [c, readPlace(c)] as const);
    const roles: (IndexRole & { family: string; cities: string[]; key: string })[] = [];
    let cursor: string | null = null;
    do {
      const page: { rows: (IndexRole & { india: boolean })[]; cursor: string | null } = await ctx.runQuery(internal.careers.jobsPage, { cursor });
      for (const r of page.rows) {
        // India sales roles from employers' own boards. LinkedIn rows are for members only.
        if (!r.india || r.externalId.startsWith("linkedin:") || AGGREGATORS.test(r.company) || NOT_EMPLOYER.test(r.company) || BAD_NAME.test(r.company.trim()) || r.company.trim().length < 2) continue;
        const family = trackForTitle(SALES_ROLES, r.title);
        if (!family) continue;
        const cities = places.filter(([, p]) => openTo(p, r.location, r.workSetting, r.title)).map(([c]) => c);
        if (jobMode(r.location, r.workSetting, r.title) === "remote") cities.push("Remote");
        const company = cleanCompany(r.company);
        if (NOT_EMPLOYER.test(company) || BAD_NAME.test(company)) continue;
        roles.push({ ...r, company, title: r.title.replace(/&amp;/gi, "&"), family: SALES_ROLES.find((s) => s.key === family)!.name, cities, key: roleKey(r.company, r.title) });
      }
      cursor = page.cursor;
    } while (cursor);
    const merged = mergeCompanies([...new Set(roles.map((r) => r.company))]);
    for (const r of roles) r.company = merged(r.company);
    const reposts = new Map<string, number>();
    const keys = [...new Set(roles.map((r) => r.key))];
    for (let i = 0; i < keys.length; i += 1000) {
      const rows: { key: string; reposts: number }[] = await ctx.runQuery(internal.careers.repostsFor, { keys: keys.slice(i, i + 1000) });
      for (const r of rows) reposts.set(r.key, r.reposts);
    }
    const index = buildIndex(roles, reposts, SALES_ROLES.map((s) => s.name), CITIES, now);
    const week = weekOf(now);
    if (!dryRun) await ctx.runMutation(internal.hiringIndex.save, { week, data: JSON.stringify(index) });
    return `${week}: ${index.totals.open} open sales roles, ${index.totals.newWeek} new this week, ${index.totals.companies} companies${dryRun ? " (not saved)" : ""}.\n${JSON.stringify(index).slice(0, 1500)}`;
  },
});
