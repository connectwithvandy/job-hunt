import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { reviewValidator } from "./lib/cvReview";
import { chatRowV } from "./lib/chats";
import { applyFormV, briefV, jobFields, prospectFields, resumeV, trackFields, packV, prepV, callScriptV, researchV, scoreNoteV, sentV, storyFields } from "./lib/validators";

export default defineSchema({
  ...authTables,

  /** Google Jobs (JSearch) searches used per person per month, so everyone shares the free monthly quota. */
  googleUsage: defineTable({ month: v.string(), userId: v.id("users"), count: v.number() }).index("by_month_userId", ["month", "userId"]),

  /** Emails found with Hunter.io each month ("2026-10"), for the whole app, so it stays inside the free plan. */
  hunterUsage: defineTable({ month: v.string(), count: v.number() }).index("by_month", ["month"]),

  /** Gmail and Calendar read permission from Connect Gmail (convex/google.ts). The token is stored encrypted. */
  googleConnections: defineTable({ userId: v.id("users"), email: v.string(), refreshToken: v.string(), calendar: v.boolean(), connectedAt: v.number() }).index(
    "by_userId",
    ["userId"],
  ),
  /** One-time codes tying Google's answer back to the person who clicked Connect Gmail. */
  googleStates: defineTable({ userId: v.id("users"), state: v.string() }).index("by_state", ["state"]),

  /** What testers wrote in the Send feedback box, for the owner to read on the waitlist page. */
  /** Help messages and feedback from members. `solvedAt` once the owner has answered it (Admin → Feedback). */
  feedback: defineTable({ userId: v.id("users"), email: v.string(), text: v.string(), page: v.string(), solvedAt: v.optional(v.number()) }),

  /** Answers to the timed "how's it going" pop-up (lib/survey.ts). skipped means they closed it without answering. */
  surveyAnswers: defineTable({
    userId: v.id("users"),
    email: v.string(),
    kind: v.union(v.literal("found_jobs"), v.literal("recommend"), v.literal("interviews")),
    round: v.number(),
    skipped: v.boolean(),
    choice: v.optional(v.string()),
    score: v.optional(v.number()),
    note: v.optional(v.string()),
  }).index("by_userId_and_kind_and_round", ["userId", "kind", "round"]),

  /** The founding-offer email (offer.ts): one row per person sent, with their one-click answer if they gave one. */
  /** The "two setups" help email (setupHelp.ts): Connect Gmail and/or load LinkedIn connections, once per person. */
  setupHelpSends: defineTable({
    userId: v.id("users"),
    email: v.string(),
    kind: v.union(v.literal("both"), v.literal("gmail"), v.literal("linkedin")),
    sentAt: v.number(),
  }).index("by_userId", ["userId"]),

  offerSends: defineTable({
    userId: v.id("users"),
    email: v.string(),
    token: v.string(),
    sentAt: v.number(),
    answer: v.optional(v.string()),
    note: v.optional(v.string()),
    answeredAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  // Each person's job totals for the owner's admin page: kept up to date as jobs change (convex/lib/functions.ts)
  // and recounted from scratch each night in case anything slipped.
  usageTotals: defineTable({
    userId: v.id("users"),
    jobs: v.number(),
    scored: v.number(),
    tailored: v.number(),
    applied: v.number(),
    countedAt: v.number(),
  }).index("by_userId", ["userId"]),
  /** Crashes and unexpected errors people hit in the app, emailed to the owner once an hour (errors.ts). */
  appErrors: defineTable({
    userId: v.optional(v.id("users")),
    email: v.string(),
    message: v.string(),
    page: v.string(),
    emailed: v.boolean(),
  }).index("by_emailed", ["emailed"]),

  /** The waitlist: everyone who signed up, and whether the owner let them in. */
  // Free CV reviews from the public /cv-review page: one per email. The CV itself isn't kept.
  cvReviews: defineTable({
    email: v.string(),
    role: v.string(),
    score: v.number(),
    review: reviewValidator,
    /** When the one follow-up email went (cvReviewFollowUp.ts), so nobody gets two. */
    followedUpAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

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
    /** Turned down by the owner: off the waiting list, shown a kind note instead of "you're on the waitlist". */
    rejected: v.optional(v.boolean()),
    /** Paid up to this time, from the latest payment. Missing for testers and anyone who hasn't paid. */
    paidUntil: v.optional(v.number()),
    /** When the "your free week ends soon" check-in went out, so it goes once. */
    trialNoteAt: v.optional(v.number()),
    /** When the "would you give JobPipe a shoutout?" email went out, after their first interview or offer, so it goes once. */
    shoutoutAskedAt: v.optional(v.number()),
    /** When the "finish setting up" nudge went out, two days after being let in without finishing setup, so it goes once. */
    setupNudgeAt: v.optional(v.number()),
    /** When the second, personal "did something get stuck?" email went out, so it goes once. */
    setupNudge2At: v.optional(v.number()),
    /** When the day-7 email added 3 extra days to the free week. */
    trialExtendedAt: v.optional(v.number()),
    /** When the "your free trial has ended" email went out, so it goes once. */
    trialEndedNoteAt: v.optional(v.number()),
    /** When the last "new roles for you" email went out, so it goes at most once a day. */
    alertsAt: v.optional(v.number()),
    /** The IST day of the last fresh job alert, and how many went out that day (alerts.claimFresh). */
    freshDay: v.optional(v.string()),
    freshCount: v.optional(v.number()),
    /** Asked to stop the "new roles for you" email. */
    alertsOff: v.optional(v.boolean()),
    /** When the day-21 "3 quick questions" email went out (only to people who skipped the day-12 pop-up), so it goes once. */
    feedbackAskedAt: v.optional(v.number()),
    /** Paid time given through a partner deal (not paid in the app), shown on the Billing page. */
    partner: v.optional(v.object({ name: v.string(), url: v.string(), from: v.number(), until: v.number() })),
    /** The secret in this person's one-click unsubscribe link, made the first time a daily email goes out. */
    unsubKey: v.optional(v.string()),
    /** The last time they hit a paid-only limit and saw "Get the Job Hunt Pass", what it was, and how often: the warmest people to write to. */
    paywallAt: v.optional(v.number()),
    paywallWhat: v.optional(v.string()),
    paywallCount: v.optional(v.number()),
    /** The code in this person's "Invite a friend" link (jobpipe.in/?ref=CODE), made the first time they share. */
    inviteCode: v.optional(v.string()),
    /** Who invited them: the member whose invite link they signed up through. */
    invitedBy: v.optional(v.id("users")),
    /** 20%-off credits earned when friends they invited paid (one per paying friend), used one per purchase. */
    inviteCredits: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_approved", ["approved"])
    .index("by_unsubKey", ["unsubKey"])
    .index("by_inviteCode", ["inviteCode"])
    .index("by_invitedBy", ["invitedBy"]),

  /**
   * People who get the daily sales jobs email without an account: up to 3 titles, one place, their email (lowercase).
   * `key` is the secret in their unsubscribe link. `off` once they unsubscribe; signing up again turns it back on.
   */
  subscribers: defineTable({
    email: v.string(),
    titles: v.array(v.string()),
    location: v.string(),
    key: v.string(),
    off: v.optional(v.boolean()),
    /** When the last jobs email went out, so the next one only holds roles found since. */
    sentAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_key", ["key"]),

  /**
   * Paid time a partner gave someone, by email (lowercase). Applied straight away if they've signed up,
   * otherwise the moment they join. appliedAt is set once it's on their account.
   */
  partnerGrants: defineTable({
    email: v.string(),
    name: v.string(),
    url: v.string(),
    from: v.number(),
    until: v.number(),
    /** Used to greet them in the partner welcome email. */
    firstName: v.optional(v.string()),
    appliedAt: v.optional(v.number()),
    /** When the partner welcome email went out, and the "you haven't signed up yet" reminder, so each goes once. */
    welcomedAt: v.optional(v.number()),
    remindedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  /** One Razorpay order each: created when someone presses Pay, marked paid once Razorpay confirms it. */
  /**
   * Discount codes the owner makes in Admin (e.g. for a partner's people). percentOff 100 turns the plan on
   * with no payment. Each person can use a code once.
   */
  promoCodes: defineTable({
    code: v.string(),
    percentOff: v.number(),
    plans: v.array(v.union(v.literal("month"), v.literal("pass"))),
    maxUses: v.number(),
    uses: v.number(),
    expiresAt: v.optional(v.number()),
    note: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  payments: defineTable({
    userId: v.id("users"),
    orderId: v.string(),
    plan: v.union(v.literal("week"), v.literal("month"), v.literal("pass")),
    /** In paise, as Razorpay counts it. */
    amount: v.number(),
    founding: v.boolean(),
    status: v.union(v.literal("created"), v.literal("paid")),
    paymentId: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    /** The paid period this payment added, so a receipt can show it. */
    until: v.optional(v.number()),
    /** The promo code used, if any; its use is counted once the payment is paid. */
    promo: v.optional(v.string()),
    /** An invite discount on this order: "friend" (joined through a member's link) or "inviter" (a friend they invited paid). */
    invite: v.optional(v.union(v.literal("friend"), v.literal("inviter"))),
  })
    .index("by_orderId", ["orderId"])
    .index("by_userId", ["userId"])
    .index("by_status_and_founding", ["status", "founding"]),

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
    /** A few of your own LinkedIn posts, pasted, so messages carry your personality. */
    linkedinPosts: v.optional(v.string()),
    /** Longer LinkedIn messages you wrote yourself, kept from messages.csv, so notes sound like your DMs. */
    myMessages: v.optional(v.string()),
    /** Your own rules for letters and messages, like "never mention my notice period". */
    writingRules: v.optional(v.string()),
    onboarded: v.boolean(),
    contactsCount: v.optional(v.number()),
    /** When the connections file was last loaded, so Today can ask for a fresh one. Missing for files loaded before 6 Nov 2026. */
    contactsLoadedAt: v.optional(v.number()),
    /** How many people your loaded LinkedIn chats cover (lib/chats.ts), and when the file was loaded. */
    chatsCount: v.optional(v.number()),
    chatsAt: v.optional(v.number()),
    /** Your standard answers for application forms: notice period, pay, why you're moving. */
    answers: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
    /** Things you told the AI that your CV doesn't say, like how many managers you've led. Used for every tailored CV and letter. */
    facts: v.optional(v.array(v.object({ question: v.string(), answer: v.string(), at: v.number() }))),
    /** Search and score every morning without being asked. */
    autopilot: v.optional(v.boolean()),
    /** When they last picked where they'd work (setup, Roles page or the one-time pop-up on Today). */
    placesAskedAt: v.optional(v.number()),
    /** Work types they want: onsite, hybrid, remote. Missing means all three. */
    workModes: v.optional(v.array(v.union(v.literal("onsite"), v.literal("hybrid"), v.literal("remote")))),
    /** When the first AI scoring after sign-up started, so it runs once even with several roles searching at once. */
    firstScoredAt: v.optional(v.number()),
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

  /**
   * Job preferences from Profile (lib/jobPrefs.ts): lowest yearly pay in lakhs, seniority wanted, words that hide a job title.
   * Its own table, not on profiles: the job list reads it, and profiles change on every Gmail check-in and visit,
   * which would rerun the whole job list each time.
   */
  jobPrefs: defineTable({
    userId: v.id("users"),
    minPayL: v.optional(v.number()),
    levels: v.optional(v.array(v.union(v.literal("director"), v.literal("manager"), v.literal("senior"), v.literal("mid"), v.literal("junior")))),
    blockedWords: v.optional(v.array(v.string())),
    /** Postings older than this many days are archived (14, 30, 45 or 90). Missing means 45. */
    maxAgeDays: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  /** Several master CVs, e.g. one pitched for SDR leadership and one for GTM roles. */
  resumes: defineTable({ userId: v.id("users"), label: v.string(), resume: resumeV }).index("by_userId", ["userId"]),

  tracks: defineTable({ userId: v.id("users"), ...trackFields }).index("by_userId_and_key", ["userId", "key"]),

  /** The heavy parts of a job (full description, tailored CV, research, interview prep, fit write-up), read only when the job is opened. */
  jobDetails: defineTable({
    jobId: v.id("jobs"),
    userId: v.id("users"),
    description: v.optional(v.string()),
    pack: v.optional(packV),
    research: v.optional(researchV),
    prep: v.optional(prepV),
    callScript: v.optional(callScriptV),
    sent: v.optional(sentV),
    /** Each score's full reason and gaps. Many queries read every job, so the job keeps only a short reason. */
    scoreNotes: v.optional(v.array(scoreNoteV)),
    /** What they want and what to watch for; the job keeps only the blocker. */
    brief: v.optional(briefV),
    /** The application form's questions with drafted answers, read when the candidate asks. */
    applyForm: v.optional(applyFormV),
    /** Interview questions the candidate typed in, with answers drafted from their CV (newest last). */
    interviewAnswers: v.optional(v.array(v.object({ question: v.string(), answer: v.string(), at: v.number() }))),
  }).index("by_jobId", ["jobId"]),

  jobs: defineTable({ userId: v.id("users"), ...jobFields })
    .index("by_userId", ["userId"])
    .index("by_userId_and_status", ["userId", "status"])
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
    .index("by_india", ["india"])
    .searchIndex("search_title", { searchField: "title", filterFields: ["india"] }),

  /** A short fingerprint of each fast board's job list, so a quick check can skip boards that haven't changed. */
  boardStates: defineTable({ key: v.string(), hash: v.string() }).index("by_key", ["key"]),

  /**
   * When each company's careers board (by the company name its roles are filed under) was last read without an
   * error, or when the daily sweep first saw its roles. Roles from a board not read for days are taken out
   * (careersRefresh.sweep), so nobody is shown a role that may have closed long ago.
   */
  boardReads: defineTable({ name: v.string(), readAt: v.number() }).index("by_name", ["name"]),

  /** Careers boards found in job links (lib/boardFromUrl.ts), read each morning beside the hand-picked ones. */
  discoveredBoards: defineTable({
    key: v.string(),
    name: v.string(),
    ats: v.union(v.literal("ashby"), v.literal("greenhouse"), v.literal("lever"), v.literal("workday"), v.literal("keka"), v.literal("zoho"), v.literal("freshteam"), v.literal("smartrecruiters"), v.literal("rippling"), v.literal("google"), v.literal("workable"), v.literal("recruitee"), v.literal("teamtailor"), v.literal("bamboohr"), v.literal("eightfold"), v.literal("recruiterbox")),
    slug: v.string(),
  })
    .index("by_ats_and_slug", ["ats", "slug"])
    .index("by_key", ["key"]),

  /** Companies the weekly finder has looked up, so each is checked about once a month. */
  boardChecks: defineTable({ key: v.string(), checkedAt: v.number() }).index("by_key", ["key"]),

  /**
   * A hand-picked company whose careers page moved: the new page, read in place of the one in careerBoards.ts.
   * Found by careersRefresh.heal when the old page lists nothing or fails (Whatfix, 17 Nov).
   */
  boardMoves: defineTable({
    name: v.string(),
    ats: v.union(v.literal("ashby"), v.literal("greenhouse"), v.literal("lever"), v.literal("workday"), v.literal("keka"), v.literal("zoho"), v.literal("freshteam"), v.literal("smartrecruiters"), v.literal("rippling"), v.literal("google"), v.literal("workable"), v.literal("recruitee"), v.literal("teamtailor"), v.literal("bamboohr"), v.literal("eightfold"), v.literal("recruiterbox")),
    slug: v.string(),
    movedAt: v.number(),
  }).index("by_name", ["name"]),

  /** Your interview stories, reused and sharpened across jobs instead of written fresh for each one. */
  stories: defineTable({
    userId: v.id("users"),
    ...storyFields,
    /** Jobs whose interview prep used this story. */
    usedFor: v.array(v.id("jobs")),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /** Each careers-board role by company and title, so a role taken down and put up again shows as a repost. */
  // People already in the owner's open-to-work email (by profile link), so the weekly search doesn't repeat them.
  seekersSent: defineTable({ key: v.string(), at: v.number() }).index("by_key", ["key"]),
  /** The weekly India Sales Hiring Index (hiringIndex.ts): one snapshot a week, as JSON, read by the public page. */
  hiringIndex: defineTable({ week: v.string(), builtAt: v.number(), data: v.string() }).index("by_week", ["week"]),

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
    /** Gmail's id for the email, so it can be opened in Gmail. Missing on emails saved before it was kept. */
    messageId: v.optional(v.string()),
    /** The reply the AI drafted, which you can edit, then open in Gmail ready to send. */
    reply: v.optional(v.object({ subject: v.string(), text: v.string(), at: v.number() })),
    /** When you marked it answered, so it leaves Today. */
    repliedAt: v.optional(v.number()),
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

  /**
   * One morning's results from a job board with a small free quota (Adzuna), kept for everyone searching the same
   * title in the same place that day: "SDR in Bengaluru" is one search, not one per member (21 Nov: ~90 people's own
   * searches used up Adzuna's free plan). `jobs` is JSON. A row with `blocked` marks the board as out of searches.
   */
  sourceCache: defineTable({ key: v.string(), jobs: v.string(), fetchedAt: v.number(), blocked: v.optional(v.boolean()) }).index("by_key", ["key"]),
});
