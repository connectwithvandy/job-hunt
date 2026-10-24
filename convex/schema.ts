import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { jobFields, prospectFields, resumeV, trackFields } from "./lib/validators";

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
    /** Search and score every morning without being asked. */
    autopilot: v.optional(v.boolean()),
    lastAutopilot: v.optional(v.object({ at: v.number(), added: v.number(), scored: v.number(), strong: v.number(), funded: v.optional(v.number()) })),
  })
    .index("by_userId", ["userId"])
    .index("by_autopilot", ["autopilot"]),

  /** Several master CVs, e.g. one pitched for SDR leadership and one for GTM roles. */
  resumes: defineTable({ userId: v.id("users"), label: v.string(), resume: resumeV }).index("by_userId", ["userId"]),

  tracks: defineTable({ userId: v.id("users"), ...trackFields }).index("by_userId_and_key", ["userId", "key"]),

  jobs: defineTable({ userId: v.id("users"), ...jobFields })
    .index("by_userId", ["userId"])
    .index("by_userId_and_externalId", ["userId", "externalId"])
    .index("by_userId_and_roleKey", ["userId", "roleKey"]),

  /** Conversations with the in-app assistant. */
  chats: defineTable({
    userId: v.id("users"),
    title: v.string(),
    /** Set when the chat was opened from a job, so the assistant has that job's details. */
    jobId: v.optional(v.id("jobs")),
    messages: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string(), at: v.number() })),
    /** True while the assistant is still writing its latest reply. */
    pending: v.boolean(),
    updatedAt: v.number(),
  }).index("by_userId_and_updatedAt", ["userId", "updatedAt"]),

  prospects: defineTable({ userId: v.id("users"), ...prospectFields })
    .index("by_userId", ["userId"])
    .index("by_userId_and_key", ["userId", "key"]),

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
