import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 8:00 in India (02:30 UTC): find and score new jobs before the day starts.
crons.cron("morning autopilot", "30 2 * * *", internal.agent.dailyRun, {});

export default crons;
