import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { jobFields, resumeV, trackFields } from "./lib/validators";

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    /** The CV used for scoring, and for any track that doesn't pick its own. */
    defaultResumeId: v.optional(v.id("resumes")),
    photo: v.optional(v.id("_storage")),
    location: v.string(),
    onboarded: v.boolean(),
    contactsCount: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  /** Several master CVs, e.g. one pitched for SDR leadership and one for GTM roles. */
  resumes: defineTable({ userId: v.id("users"), label: v.string(), resume: resumeV }).index("by_userId", ["userId"]),

  tracks: defineTable({ userId: v.id("users"), ...trackFields }).index("by_userId_and_key", ["userId", "key"]),

  jobs: defineTable({ userId: v.id("users"), ...jobFields })
    .index("by_userId", ["userId"])
    .index("by_userId_and_externalId", ["userId", "externalId"]),

  contacts: defineTable({
    userId: v.id("users"),
    linkedinUrl: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    company: v.string(),
    /** Company name lowercased, without spaces or suffixes like "pvt ltd", for matching. */
    companyKey: v.string(),
    position: v.string(),
    connectedOn: v.string(),
  }).index("by_userId_and_companyKey", ["userId", "companyKey"]),
});
