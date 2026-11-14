/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as agent from "../agent.js";
import type * as alerts from "../alerts.js";
import type * as applyAnswers from "../applyAnswers.js";
import type * as applyForm from "../applyForm.js";
import type * as auth from "../auth.js";
import type * as careers from "../careers.js";
import type * as careersFinder from "../careersFinder.js";
import type * as careersRefresh from "../careersRefresh.js";
import type * as chats from "../chats.js";
import type * as contacts from "../contacts.js";
import type * as costs from "../costs.js";
import type * as crons from "../crons.js";
import type * as cvReview from "../cvReview.js";
import type * as cvReviewFollowUp from "../cvReviewFollowUp.js";
import type * as cvReviews from "../cvReviews.js";
import type * as cvTopJobs from "../cvTopJobs.js";
import type * as emailFinder from "../emailFinder.js";
import type * as errors from "../errors.js";
import type * as feedback from "../feedback.js";
import type * as google from "../google.js";
import type * as growth from "../growth.js";
import type * as growthNotes from "../growthNotes.js";
import type * as hiringIndex from "../hiringIndex.js";
import type * as hiringIndexBuild from "../hiringIndexBuild.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as inboxReader from "../inboxReader.js";
import type * as jobs from "../jobs.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_apify from "../lib/apify.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_boardFinder from "../lib/boardFinder.js";
import type * as lib_boardFromUrl from "../lib/boardFromUrl.js";
import type * as lib_brain from "../lib/brain.js";
import type * as lib_careerBoards from "../lib/careerBoards.js";
import type * as lib_careers from "../lib/careers.js";
import type * as lib_chats from "../lib/chats.js";
import type * as lib_company from "../lib/company.js";
import type * as lib_costs from "../lib/costs.js";
import type * as lib_cvMatch from "../lib/cvMatch.js";
import type * as lib_cvReview from "../lib/cvReview.js";
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_digest from "../lib/digest.js";
import type * as lib_directLink from "../lib/directLink.js";
import type * as lib_dreamwork from "../lib/dreamwork.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_facts from "../lib/facts.js";
import type * as lib_followups from "../lib/followups.js";
import type * as lib_formQuestions from "../lib/formQuestions.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_guide from "../lib/guide.js";
import type * as lib_health from "../lib/health.js";
import type * as lib_hiringIndex from "../lib/hiringIndex.js";
import type * as lib_hunter from "../lib/hunter.js";
import type * as lib_inbox from "../lib/inbox.js";
import type * as lib_messageText from "../lib/messageText.js";
import type * as lib_outcomes from "../lib/outcomes.js";
import type * as lib_pdfText from "../lib/pdfText.js";
import type * as lib_places from "../lib/places.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_pool from "../lib/pool.js";
import type * as lib_posting from "../lib/posting.js";
import type * as lib_quickFit from "../lib/quickFit.js";
import type * as lib_razorpay from "../lib/razorpay.js";
import type * as lib_salesRoles from "../lib/salesRoles.js";
import type * as lib_services from "../lib/services.js";
import type * as lib_sources from "../lib/sources.js";
import type * as lib_survey from "../lib/survey.js";
import type * as lib_trial from "../lib/trial.js";
import type * as lib_validators from "../lib/validators.js";
import type * as limits from "../limits.js";
import type * as payments from "../payments.js";
import type * as prospects from "../prospects.js";
import type * as serviceCheck from "../serviceCheck.js";
import type * as shoutout from "../shoutout.js";
import type * as stats from "../stats.js";
import type * as stories from "../stories.js";
import type * as subscriberSend from "../subscriberSend.js";
import type * as subscribers from "../subscribers.js";
import type * as surveys from "../surveys.js";
import type * as trial from "../trial.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  agent: typeof agent;
  alerts: typeof alerts;
  applyAnswers: typeof applyAnswers;
  applyForm: typeof applyForm;
  auth: typeof auth;
  careers: typeof careers;
  careersFinder: typeof careersFinder;
  careersRefresh: typeof careersRefresh;
  chats: typeof chats;
  contacts: typeof contacts;
  costs: typeof costs;
  crons: typeof crons;
  cvReview: typeof cvReview;
  cvReviewFollowUp: typeof cvReviewFollowUp;
  cvReviews: typeof cvReviews;
  cvTopJobs: typeof cvTopJobs;
  emailFinder: typeof emailFinder;
  errors: typeof errors;
  feedback: typeof feedback;
  google: typeof google;
  growth: typeof growth;
  growthNotes: typeof growthNotes;
  hiringIndex: typeof hiringIndex;
  hiringIndexBuild: typeof hiringIndexBuild;
  http: typeof http;
  inbox: typeof inbox;
  inboxReader: typeof inboxReader;
  jobs: typeof jobs;
  "lib/ai": typeof lib_ai;
  "lib/apify": typeof lib_apify;
  "lib/auth": typeof lib_auth;
  "lib/boardFinder": typeof lib_boardFinder;
  "lib/boardFromUrl": typeof lib_boardFromUrl;
  "lib/brain": typeof lib_brain;
  "lib/careerBoards": typeof lib_careerBoards;
  "lib/careers": typeof lib_careers;
  "lib/chats": typeof lib_chats;
  "lib/company": typeof lib_company;
  "lib/costs": typeof lib_costs;
  "lib/cvMatch": typeof lib_cvMatch;
  "lib/cvReview": typeof lib_cvReview;
  "lib/defaults": typeof lib_defaults;
  "lib/digest": typeof lib_digest;
  "lib/directLink": typeof lib_directLink;
  "lib/dreamwork": typeof lib_dreamwork;
  "lib/email": typeof lib_email;
  "lib/facts": typeof lib_facts;
  "lib/followups": typeof lib_followups;
  "lib/formQuestions": typeof lib_formQuestions;
  "lib/functions": typeof lib_functions;
  "lib/guide": typeof lib_guide;
  "lib/health": typeof lib_health;
  "lib/hiringIndex": typeof lib_hiringIndex;
  "lib/hunter": typeof lib_hunter;
  "lib/inbox": typeof lib_inbox;
  "lib/messageText": typeof lib_messageText;
  "lib/outcomes": typeof lib_outcomes;
  "lib/pdfText": typeof lib_pdfText;
  "lib/places": typeof lib_places;
  "lib/plans": typeof lib_plans;
  "lib/pool": typeof lib_pool;
  "lib/posting": typeof lib_posting;
  "lib/quickFit": typeof lib_quickFit;
  "lib/razorpay": typeof lib_razorpay;
  "lib/salesRoles": typeof lib_salesRoles;
  "lib/services": typeof lib_services;
  "lib/sources": typeof lib_sources;
  "lib/survey": typeof lib_survey;
  "lib/trial": typeof lib_trial;
  "lib/validators": typeof lib_validators;
  limits: typeof limits;
  payments: typeof payments;
  prospects: typeof prospects;
  serviceCheck: typeof serviceCheck;
  shoutout: typeof shoutout;
  stats: typeof stats;
  stories: typeof stories;
  subscriberSend: typeof subscriberSend;
  subscribers: typeof subscribers;
  surveys: typeof surveys;
  trial: typeof trial;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
