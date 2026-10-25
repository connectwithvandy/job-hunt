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
import type * as auth from "../auth.js";
import type * as careers from "../careers.js";
import type * as careersFinder from "../careersFinder.js";
import type * as careersRefresh from "../careersRefresh.js";
import type * as chats from "../chats.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as jobs from "../jobs.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_boardFromUrl from "../lib/boardFromUrl.js";
import type * as lib_brain from "../lib/brain.js";
import type * as lib_careerBoards from "../lib/careerBoards.js";
import type * as lib_careers from "../lib/careers.js";
import type * as lib_company from "../lib/company.js";
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_dreamwork from "../lib/dreamwork.js";
import type * as lib_facts from "../lib/facts.js";
import type * as lib_inbox from "../lib/inbox.js";
import type * as lib_places from "../lib/places.js";
import type * as lib_quickFit from "../lib/quickFit.js";
import type * as lib_sources from "../lib/sources.js";
import type * as lib_validators from "../lib/validators.js";
import type * as limits from "../limits.js";
import type * as prospects from "../prospects.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  agent: typeof agent;
  auth: typeof auth;
  careers: typeof careers;
  careersFinder: typeof careersFinder;
  careersRefresh: typeof careersRefresh;
  chats: typeof chats;
  contacts: typeof contacts;
  crons: typeof crons;
  http: typeof http;
  inbox: typeof inbox;
  jobs: typeof jobs;
  "lib/ai": typeof lib_ai;
  "lib/auth": typeof lib_auth;
  "lib/boardFromUrl": typeof lib_boardFromUrl;
  "lib/brain": typeof lib_brain;
  "lib/careerBoards": typeof lib_careerBoards;
  "lib/careers": typeof lib_careers;
  "lib/company": typeof lib_company;
  "lib/defaults": typeof lib_defaults;
  "lib/dreamwork": typeof lib_dreamwork;
  "lib/facts": typeof lib_facts;
  "lib/inbox": typeof lib_inbox;
  "lib/places": typeof lib_places;
  "lib/quickFit": typeof lib_quickFit;
  "lib/sources": typeof lib_sources;
  "lib/validators": typeof lib_validators;
  limits: typeof limits;
  prospects: typeof prospects;
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
