import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sundays 5:30 in India: look up more B2B and AI startups' careers boards (careersFinder.ts).
crons.weekly("careers finder", { dayOfWeek: "sunday", hourUTC: 0, minuteUTC: 0 }, internal.careersFinder.find, {});

// 7:00 in India (01:30 UTC): read every company careers board, an hour before the searches use them.
crons.cron("careers boards", "30 1 * * *", internal.careersRefresh.refresh, {});

// Early applicants get read first, so new roles are checked all day and strong ones emailed straight away.
// Every 15 minutes: boards with a light job list. A board that hasn't changed costs almost nothing (careersRefresh.quickCheck).
crons.interval("quick job check", { minutes: 15 }, internal.careersRefresh.quickCheck, {});

// Every hour: the boards too heavy to check that often.
crons.cron("fresh jobs", "30 * * * *", internal.careersRefresh.refresh, { fresh: true });

// 7:40 in India: today's LinkedIn sales roles into the same shared list, before the morning run reads it.
crons.cron("linkedin pool", "10 2 * * *", internal.careersRefresh.linkedInPool, {});

// 8:00 in India (02:30 UTC): find and score new jobs before the day starts.
crons.cron("morning autopilot", "30 2 * * *", internal.agent.dailyRun, {});

// 16:00 IST: the afternoon top-up, free sources only and no scoring.
crons.cron("afternoon top-up", "30 10 * * *", internal.agent.dailyRun, { light: true });

// Mondays 10:45 IST: what JobPipe did for each person this week.
crons.cron("weekly progress", "15 5 * * 1", internal.alerts.sendWeekly, {});

// 9:30 IST: each member's best new roles from this morning's search, under their own role groups.
crons.cron("new roles emails", "0 4 * * *", internal.alerts.send, {});
// 12:30 IST: a catch-up for anyone the 9:30 run missed. People who got one in the last 20 hours are skipped (alerts.candidates).
crons.cron("new roles emails catch-up", "0 7 * * *", internal.alerts.send, {});

// 10:30 in India (05:00 UTC): a personal check-in two days before someone's free week ends (trial.ts).
crons.cron("trial check-ins", "0 5 * * *", internal.trial.sendCheckIns, {});

// Every hour: recruiting emails and meetings for everyone who clicked Connect Gmail (google.ts).
// 11:30 IST: ask anyone who just reached an interview or offer for a LinkedIn shoutout, once each.
crons.cron("shoutout asks", "0 6 * * *", internal.shoutout.sendAsks, {});

// 7:30, 12:30 and 17:30 IST: is the AI, Dreamwork or Apify down? Emails the owner only if so (serviceCheck.ts).
crons.cron("service watch morning", "0 2 * * *", internal.serviceCheck.watch, {});
crons.cron("service watch midday", "0 7 * * *", internal.serviceCheck.watch, {});
crons.cron("service watch evening", "0 12 * * *", internal.serviceCheck.watch, {});

// 9:15 IST: the owner's one morning email: who's waiting, today's LinkedIn post, open-to-work people, errors (growth.ts).
// It replaces the separate jobs post, open-to-work list, waitlist and hourly error emails.
crons.cron("owner morning email", "45 3 * * *", internal.growth.sendMorning, {});

// Mondays 9:00 IST: sales roles that keep getting reposted, as a ready LinkedIn post for the owner.
crons.cron("weekly repost post", "30 3 * * 1", internal.growth.sendRepostPost, {});

// 11:00 IST: one friendly nudge to anyone let in 2+ days ago who hasn't finished setup.
crons.cron("setup nudges", "30 5 * * *", internal.growth.sendSetupNudges, {});

// 11:15 IST: day-21 "3 quick questions" email, only to people who skipped the day-12 pop-up.
crons.cron("feedback asks", "45 5 * * *", internal.growth.sendFeedbackAsks, {});
// 3:00 IST, a quiet hour: recount everyone's usage totals from scratch.
crons.cron("recount usage", "30 21 * * *", internal.stats.recountAll, {});

crons.interval("gmail sync", { hours: 1 }, internal.google.syncAll, {});

export default crons;
