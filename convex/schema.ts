import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { chatRowV } from "./lib/chats";
import { jobFields, prospectFields, resumeV, trackFields, packV, prepV, researchV, sentV, storyFields } from "./lib/validators";

export default defineSchema({
  ...authTables,

  /** Google Jobs (JSearch) searches used per person per month, so everyone shares the free monthly quota. */
  googleUsage: defineTable({ month: v.string(), userId: v.id("users"), count: v.number() }).index("by_month_userId", ["month", "userId"]),

  /** Gmail and Calendar read permission from Connect Gmail (convex/google.ts). The token is stored encrypted. */
  googleConnections: defineTable({ userId: v.id("users"), email: v.string(), refreshToken: v.string(), calendar: v.boolean(), connectedAt: v.number() }).index(
    "by_userId",
    ["userId"],
  ),
  /** One-time codes tying Google's answer back to the person who clicked Connect Gmail. */
  googleStates: defineTable({ userId: v.id("users"), state: v.string() }).index("by_state", ["state"]),

  /** What testers wrote in the Send feedback box, for the owner to read on the waitlist page. */
  feedback: defineTable({ userId: v.id("users"), email: v.string(), text: v.string(), page: v.string() }),

  /** The waitlist: everyone who signed up, and whether the owner let them in. */
  access: defineTable({
    userId: v.id("users"),
    email: v.string(),
    approved: v.boolean(),
    decidedAt: v.optional(v.number()),
    // What they told us while waiting, so the owner can decide quickly.
    name: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    role: v.optional(v.string()),
    // When the "you're in" email went out, so letting someone in twice doesn't send it twice.
    welcomedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_approved", ["approved"]),

  profiles: defineTable({
    userId: v.id("users"),
    /** The CV used for scoring, and for any track that doesn't pick its own. */
    defaultResumeId: v.optional(v.id("resumes")),
    photo: v.optional(v.id("_storage")),
    location: v.string(),
    /** Which markets and time zones you'd rather cover, like "APAC and EMEA first, North America second". */
    markets: v.optional(v.string()),
    /** A few things you wrote yourself, so letters and messages sound like you. */
    writingSample: v.optional(v.string()),
    /** Your own rules for letters and messages, like "never mention my notice period". */
    writingRules: v.optional(v.string()),
    onboarded: v.boolean(),
    contactsCount: v.optional(v.number()),
    /** How many people your loaded LinkedIn chats cover (lib/chats.ts), and when the file was loaded. */
    chatsCount: v.optional(v.number()),
    chatsAt: v.optional(v.number()),
    /** Your standard answers for application forms: notice period, pay, why you're moving. */
    answers: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
    /** Things you told the AI that your CV doesn't say, like how many managers you've led. Used for every tailored CV and letter. */
    facts: v.optional(v.array(v.object({ question: v.string(), answer: v.string(), at: v.number() }))),
    /** Search and score every morning without being asked. */
    autopilot: v.optional(v.boolean()),
    /** When you last opened the app, and the visit before, for "New since your last visit". */
    lastSeenAt: v.optional(v.number()),
    /** Private code the Gmail script sends with recruiting emails (inbox.ts). */
    inboxToken: v.optional(v.string()),
    /** When the Gmail script last checked in, so the app can say it's connected. */
    inboxAt: v.optional(v.number()),
    /** When the Gmail script last emailed you the morning summary. */
    digestAt: v.optional(v.number()),
    prevSeenAt: v.optional(v.number()),
    lastAutopilot: v.optional(v.object({ at: v.number(), added: v.number(), scored: v.number(), strong: v.number(), funded: v.optional(v.number()), failed: v.optional(v.array(v.string())) })),
    /** What keeps costing you, read from your rejections and silences (agent.learnFromNoes). */
    lessons: v.optional(
      v.object({
        at: v.number(),
        /** How many noes it read, so the page knows when there are enough new ones to read again. */
        basedOn: v.number(),
        summary: v.string(),
        items: v.array(v.object({ gap: v.string(), seen: v.number(), fix: v.string(), kind: v.union(v.literal("cv"), v.literal("skill"), v.literal("targeting")) })),
      }),
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_autopilot", ["autopilot"])
    .index("by_inboxToken", ["inboxToken"]),

  /** Several master CVs, e.g. one pitched for SDR leadership and one for GTM roles. */
  resumes: defineTable({ userId: v.id("users"), label: v.string(), resume: resumeV }).index("by_userId", ["userId"]),

  tracks: defineTable({ userId: v.id("users"), ...trackFields }).index("by_userId_and_key", ["userId", "key"]),

  /** The heavy parts of a job (full description, tailored CV, research, interview prep), read only when the job is opened. */
  jobDetails: defineTable({
    jobId: v.id("jobs"),
    userId: v.id("users"),
    description: v.optional(v.string()),
    pack: v.optional(packV),
    research: v.optional(researchV),
    prep: v.optional(prepV),
    sent: v.optional(sentV),
  }).index("by_jobId", ["jobId"]),

  jobs: defineTable({ userId: v.id("users"), ...jobFields })
    .index("by_userId", ["userId"])
    .index("by_userId_and_externalId", ["userId", "externalId"])
    .index("by_userId_and_roleKey", ["userId", "roleKey"]),

  /** Open roles from the companies' own careers boards (lib/careerBoards.ts), shared by everyone and refreshed each morning. */
  careerJobs: defineTable({
    externalId: v.string(),
    company: v.string(),
    title: v.string(),
    location: v.string(),
    workSetting: v.optional(v.string()),
    salary: v.optional(v.string()),
    postedAt: v.optional(v.string()),
    url: v.string(),
    /** Based in India or open to it, so India searches skip the thousands of US roles. */
    india: v.boolean(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_company", ["company"])
    .searchIndex("search_title", { searchField: "title", filterFields: ["india"] }),

  /** Careers boards found in job links (lib/boardFromUrl.ts), read each morning beside the hand-picked ones. */
  discoveredBoards: defineTable({
    key: v.string(),
    name: v.string(),
    ats: v.union(v.literal("ashby"), v.literal("greenhouse"), v.literal("lever"), v.literal("workday"), v.literal("keka"), v.literal("zoho"), v.literal("freshteam"), v.literal("smartrecruiters"), v.literal("rippling"), v.literal("google")),
    slug: v.string(),
  })
    .index("by_ats_and_slug", ["ats", "slug"])
    .index("by_key", ["key"]),

  /** Companies the weekly finder has looked up, so each is checked about once a month. */
  boardChecks: defineTable({ key: v.string(), checkedAt: v.number() }).index("by_key", ["key"]),

  /** Your interview stories, reused and sharpened across jobs instead of written fresh for each one. */
  stories: defineTable({
    userId: v.id("users"),
    ...storyFields,
    /** Jobs whose interview prep used this story. */
    usedFor: v.array(v.id("jobs")),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /** Each careers-board role by company and title, so a role taken down and put up again shows as a repost. */
  roleSightings: defineTable({ key: v.string(), firstSeen: v.number(), reposts: v.number(), lastClosedAt: v.optional(v.number()) }).index("by_key", ["key"]),

  /** Gmail messages already read, so the hourly script never counts one twice. */
  /** Every recruiting email the Gmail script matched to a job, so the job page shows the whole conversation. */
  jobEmails: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    from: v.string(),
    subject: v.string(),
    snippet: v.string(),
    at: v.number(),
    stage: v.string(),
  }).index("by_jobId_and_at", ["jobId", "at"]),

  /** Meetings on your Google Calendar that match a job, sent by the Gmail script. Other meetings are never stored. */
  interviews: defineTable({
    userId: v.id("users"),
    jobId: v.id("jobs"),
    eventId: v.string(),
    title: v.string(),
    start: v.number(),
    end: v.number(),
    link: v.string(),
  })
    .index("by_userId_and_start", ["userId", "start"])
    .index("by_userId_and_eventId", ["userId", "eventId"])
    .index("by_jobId_and_start", ["jobId", "start"]),

  inboxSeen: defineTable({ userId: v.id("users"), messageId: v.string() }).index("by_userId_and_messageId", ["userId", "messageId"]),

  /** A careers-board role's description, kept apart so searching the titles stays light. */
  careerJobTexts: defineTable({ externalId: v.string(), description: v.string() }).index("by_externalId", ["externalId"]),

  /** A reply while it's being written, kept apart so streaming doesn't rewrite the whole chat several times a second. */
  chatDrafts: defineTable({ chatId: v.id("chats"), userId: v.id("users"), text: v.string(), at: v.number() }).index("by_chatId", ["chatId"]),

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
    .index("by_userId_and_key", ["userId", "key"])
    .index("by_userId_and_dream", ["userId", "dream"]),

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
    /** You marked them as no longer at this company, so they aren't suggested for referrals there. */
    left: v.optional(v.boolean()),
  }).index("by_userId_and_companyKey", ["userId", "companyKey"]),

  /** A short summary of your LinkedIn chats with one person, from messages.csv. Kept apart from contacts so reloading connections keeps it. */
  linkedinChats: defineTable({ userId: v.id("users"), ...chatRowV.fields })
    .index("by_userId_and_profileKey", ["userId", "profileKey"])
    .index("by_userId_and_nameKey", ["userId", "nameKey"]),
});
