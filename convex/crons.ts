import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sundays 5:30 in India: look up more B2B and AI startups' careers boards (careersFinder.ts).
crons.weekly("careers finder", { dayOfWeek: "sunday", hourUTC: 0, minuteUTC: 0 }, internal.careersFinder.find, {});

// 7:00 in India (01:30 UTC): read every company careers board, an hour before the searches use them.
crons.cron("careers boards", "30 1 * * *", internal.careersRefresh.refresh, {});

// 8:00 in India (02:30 UTC): find and score new jobs before the day starts.
crons.cron("morning autopilot", "30 2 * * *", internal.agent.dailyRun, {});

// 10:30 in India (05:00 UTC): a personal check-in two days before someone's free week ends (trial.ts).
crons.cron("trial check-ins", "0 5 * * *", internal.trial.sendCheckIns, {});

// Every hour: recruiting emails and meetings for everyone who clicked Connect Gmail (google.ts).
// 11:30 IST: ask anyone who just reached an interview or offer for a LinkedIn shoutout, once each.
crons.cron("shoutout asks", "0 6 * * *", internal.shoutout.sendAsks, {});

crons.interval("gmail sync", { hours: 1 }, internal.google.syncAll, {});

// Every hour: email the owner any app errors people hit since the last email (errors.ts).
crons.interval("error alerts", { hours: 1 }, internal.errors.mailOwner, {});

export default crons;
