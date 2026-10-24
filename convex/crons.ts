import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 7:00 in India (01:30 UTC): read every company careers board, an hour before the searches use them.
crons.cron("careers boards", "30 1 * * *", internal.careersRefresh.refresh, {});

// 8:00 in India (02:30 UTC): find and score new jobs before the day starts.
crons.cron("morning autopilot", "30 2 * * *", internal.agent.dailyRun, {});

export default crons;
