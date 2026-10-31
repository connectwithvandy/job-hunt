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
    /** Reads LinkedIn posts through Apify (lib/apify.ts). The owner's account only, for now. */
    APIFY_TOKEN: v.optional(v.string()),
    /** Google Jobs through RapidAPI (lib/sources.ts). Off when missing. */
    JSEARCH_API_KEY: v.optional(v.string()),
    /** Google Jobs searches the whole app may use a month, split between everyone; defaults to 190 (the free plan is 200). */
    JSEARCH_MONTHLY: v.optional(v.string()),
  },
});
app.use(rateLimiter);
export default app;
