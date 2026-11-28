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
    /** Where the app lives, for links in the morning email; defaults to https://jobpipe.in. */
    APP_URL: v.optional(v.string()),
    /** Reads LinkedIn posts through Apify (lib/apify.ts). The owner's account only, for now. */
    APIFY_TOKEN: v.optional(v.string()),
    /** Posts the morning jobs post to the owner's LinkedIn through Buffer (growth.scheduleOnBuffer). Off when missing. */
    BUFFER_API_KEY: v.optional(v.string()),
    /** Saves the morning jobs post as a LinkedIn DRAFT on the owner's profile through Composio, so she can add
     * JobPipe as a collaborator in LinkedIn's own composer before posting (growth.saveLinkedInDraft). Buffer is the
     * fallback when missing or failing. Her own Composio user key; the LinkedIn author URN can be overridden. */
    COMPOSIO_USER_API_KEY: v.optional(v.string()),
    /** Her Composio user id (the one that owns the LinkedIn connection); Composio needs it with the key. */
    COMPOSIO_USER_ID: v.optional(v.string()),
    /** Her LinkedIn connection in Composio (ca_…). */
    COMPOSIO_LINKEDIN_ACCOUNT: v.optional(v.string()),
    /** The Composio project that holds her LinkedIn connection (pr_…); a user key needs it. */
    COMPOSIO_PROJECT_ID: v.optional(v.string()),
    /** "1" on prod only: new public role pages are sent to IndexNow (Bing, and ChatGPT search through it). */
    INDEXNOW_ON: v.optional(v.string()),
    LINKEDIN_AUTHOR_URN: v.optional(v.string()),
    /** Google Jobs through RapidAPI (lib/sources.ts). Off when missing. */
    JSEARCH_API_KEY: v.optional(v.string()),
    SUBSCRIBER_DAILY: v.optional(v.string()),
    APIFY_OWNER_EXTRAS: v.optional(v.string()),
    // "on" turns back hourly AI scoring of new roles for paying people (agent.freshFor). Off since 13 Nov.
    FRESH_SCORING: v.optional(v.string()),
    /** "1" skips the costly scheduled jobs (careers boards, LinkedIn/Google pulls, morning search, rechecks, Gmail sync).
     *  Set on the dev deployment only, so the test copy stays usable without spending (~$6/month, 17 Nov). */
    SCHEDULED_OFF: v.optional(v.string()),
    /** Connect Gmail (convex/google.ts): the Google Cloud OAuth client. Off when missing. */
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    /** Where Google sends people back after Connect Gmail; defaults to the backend's own address. */
    GOOGLE_REDIRECT_URI: v.optional(v.string()),
    /** Reads job pages built with JavaScript (Workday and others) when a plain fetch gets nothing. Off when missing. */
    FIRECRAWL_API_KEY: v.optional(v.string()),
    /** Google Jobs searches the whole app may use a month, split between everyone; defaults to 190 (the free plan is 200). */
    JSEARCH_MONTHLY: v.optional(v.string()),
    /** Reads Anthropic's cost report for the COSTS block of the morning email (convex/costs.ts). An Admin API key; off when missing. */
    ANTHROPIC_ADMIN_KEY: v.optional(v.string()),
    /** Counts only this Anthropic workspace's spend in COSTS (a wrkspc_ id); without it, the whole organization. */
    ANTHROPIC_COST_WORKSPACE: v.optional(v.string()),
    /** Rupees per dollar for the COSTS block; defaults to 88. */
    USD_INR: v.optional(v.string()),
    /** AI work the whole app may do in a day, in rough units (limits.ts AI_UNITS); defaults to 3000. */
    AI_DAILY_UNITS: v.optional(v.string()),
    /** Sends every app email through Brevo first (lib/email.ts, free 300 a day). Resend is used when it's missing or fails. */
    BREVO_API_KEY: v.optional(v.string()),
    /** Sends the app's emails through Resend (lib/email.ts) when Brevo is missing or fails. Email is off when both are missing. */
    RESEND_API_KEY: v.optional(v.string()),
    /** Finds a hiring contact's work email (convex/emailFinder.ts). Off when missing. */
    HUNTER_API_KEY: v.optional(v.string()),
    /** Emails the whole app may find with Hunter.io a month; defaults to 25 (the free plan has 50 credits). */
    HUNTER_MONTHLY: v.optional(v.string()),
    /** Razorpay checkout (convex/payments.ts): API key id and secret, test or live. Payments are off when missing. */
    RAZORPAY_KEY_ID: v.optional(v.string()),
    RAZORPAY_KEY_SECRET: v.optional(v.string()),
    /** Checks that calls to /razorpay/webhook really come from Razorpay. Set the same secret on Razorpay's Webhooks page. */
    RAZORPAY_WEBHOOK_SECRET: v.optional(v.string()),
    /** Lets the GitHub careers-board read (scripts/careers-runner.ts) call careersRunner.ts. Same value as the GitHub
     * secret of that name. The read refuses every call when missing. */
    CAREERS_RUNNER_SECRET: v.optional(v.string()),
  },
});
app.use(rateLimiter);
export default app;
