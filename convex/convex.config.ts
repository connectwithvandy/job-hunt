import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp({
  env: {
    /** Pays for every AI call the app makes. */
    ANTHROPIC_API_KEY: v.optional(v.string()),
    /** Comma-separated emails that skip the daily limits (the app's owner). */
    OWNER_EMAILS: v.optional(v.string()),
    /** Claude model id; defaults to claude-opus-5-5. */
    JOBHUNT_MODEL: v.optional(v.string()),
    /** Where the app lives, for links in the morning email; defaults to https://myjobpipe.vercel.app. */
    APP_URL: v.optional(v.string()),
  },
});
app.use(rateLimiter);
export default app;
