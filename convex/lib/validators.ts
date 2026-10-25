import { v } from "convex/values";

export const resumeV = v.object({
  name: v.string(),
  headline: v.string(),
  summary: v.string(),
  contact: v.object({ phone: v.string(), email: v.string(), location: v.string(), linkedin: v.string() }),
  experience: v.array(
    v.object({
      id: v.string(),
      company: v.string(),
      role: v.string(),
      start: v.string(),
      end: v.string(),
      location: v.string(),
      blurb: v.string(),
      bullets: v.array(v.string()),
      /** The company's website, like "jumpcloud.com", for its logo. */
      domain: v.optional(v.string()),
    }),
  ),
  education: v.array(
    v.object({ school: v.string(), degree: v.string(), detail: v.string(), year: v.string(), notes: v.array(v.string()), domain: v.optional(v.string()) }),
  ),
  certifications: v.array(v.object({ name: v.string(), detail: v.string() })),
  skills: v.object({ technical: v.array(v.string()), soft: v.array(v.string()) }),
  extras: v.array(v.object({ title: v.string(), items: v.array(v.object({ heading: v.string(), text: v.string() })) })),
});

export const trackFields = {
  key: v.string(),
  name: v.string(),
  color: v.string(),
  status: v.union(v.literal("active"), v.literal("paused")),
  titles: v.array(v.string()),
  pitch: v.string(),
  /** Set for an internal-move track: only this company's roles, and notes go to colleagues. */
  company: v.optional(v.string()),
  /** Which of your CVs this track starts from; the default CV when unset. */
  resumeId: v.optional(v.id("resumes")),
  /** What to ask for in this role, researched on the web when you ask. */
  pay: v.optional(v.object({ low: v.number(), high: v.number(), currency: v.string(), basis: v.string(), sources: v.array(v.string()), at: v.number() })),
};

export const jobStatusV = v.union(
  v.literal("new"),
  v.literal("applying"),
  v.literal("applied"),
  v.literal("screening"),
  v.literal("interview"),
  v.literal("offer"),
  v.literal("rejected"),
  v.literal("dismissed"),
);

export const outreachStatusV = v.union(v.literal("draft"), v.literal("sent"), v.literal("replied"), v.literal("referred"));

export const outreachV = v.object({
  contactId: v.string(),
  name: v.string(),
  position: v.string(),
  url: v.string(),
  message: v.string(),
  status: outreachStatusV,
  sentAt: v.optional(v.number()),
});

export const packV = v.object({
  /** Missing when the CV was pitched straight at the job, not from a track. */
  trackKey: v.optional(v.string()),
  /** What you asked to change when this version was written. */
  feedback: v.optional(v.string()),
  createdAt: v.number(),
  resume: resumeV,
  coverLetter: v.string(),
  /** A short note to send HR or the hiring manager directly, on LinkedIn or by email. */
  directNote: v.optional(v.string()),
  /** The same pitch as a fuller email. Missing on packs written before emails existed. */
  emailSubject: v.optional(v.string()),
  email: v.optional(v.string()),
  hiringManagerTitles: v.array(v.string()),
  /** Numbers in the tailored CV that don't appear in the master CV. Should be empty. */
  unverified: v.array(v.string()),
});

/** Someone at the company you plan to contact directly: the hiring manager, HR or a recruiter. */
export const hiringContactV = v.object({
  id: v.string(),
  name: v.string(),
  title: v.string(),
  linkedinUrl: v.string(),
  email: v.string(),
  phone: v.string(),
  /** Their LinkedIn About and Experience, pasted by you, for finding common ground. */
  profileText: v.optional(v.string()),
  /** What you share with them, and the messages rewritten for them. */
  commonGround: v.optional(v.array(v.object({ point: v.string(), use: v.string() }))),
  note: v.optional(v.string()),
  emailSubject: v.optional(v.string()),
  email2: v.optional(v.string()),
});

/** What the web says about the company, gathered when you ask. */
export const researchV = v.object({
  createdAt: v.number(),
  summary: v.string(),
  size: v.string(),
  funding: v.string(),
  news: v.array(v.string()),
  india: v.string(),
  hiringSignals: v.string(),
  sources: v.array(v.string()),
});

/** Interview preparation for one job, built from the CV and the posting. */
export const prepV = v.object({
  createdAt: v.number(),
  questions: v.array(v.object({ question: v.string(), why: v.string(), answer: v.string() })),
  stories: v.array(v.object({ title: v.string(), situation: v.string(), action: v.string(), result: v.string() })),
  askThem: v.array(v.string()),
  first90Days: v.array(v.string()),
});

export const scoreV = v.object({ trackKey: v.string(), score: v.number(), reason: v.string(), gaps: v.array(v.string()) });

export const jobFields = {
  externalId: v.string(),
  /** Company plus title, so the same role from another board or a later search isn't added twice. */
  roleKey: v.optional(v.string()),
  source: v.union(v.literal("dreamwork"), v.literal("jsearch"), v.literal("adzuna"), v.literal("himalayas"), v.literal("careers"), v.literal("link"), v.literal("pasted")),
  url: v.string(),
  sourceUrl: v.optional(v.string()),
  title: v.string(),
  company: v.string(),
  companyLogo: v.optional(v.string()),
  location: v.string(),
  workSetting: v.optional(v.string()),
  salary: v.optional(v.string()),
  seniority: v.optional(v.string()),
  postedAt: v.optional(v.string()),
  description: v.optional(v.string()),
  /** Track whose search found this job. Scoring may move it. */
  foundFor: v.optional(v.string()),
  scores: v.optional(v.array(scoreV)),
  /** Free first guess at fit (lib/quickFit.ts), shown until the AI score arrives. */
  quickFit: v.optional(v.number()),
  /** The latest recruiting email about this job, read by the Gmail script. */
  lastEmail: v.optional(v.object({ subject: v.string(), from: v.string(), at: v.number(), stage: v.string() })),
  brief: v.optional(v.object({ whatTheyWant: v.string(), watchOuts: v.string() })),
  trackKey: v.optional(v.string()),
  status: jobStatusV,
  /** Older jobs keep these four on the job; newer ones keep them in jobDetails, so job lists stay light. */
  pack: v.optional(packV),
  /** Whether a tailored CV has been written, so lists can show it without loading it. */
  hasPack: v.optional(v.boolean()),
  outreach: v.array(outreachV),
  hiringContacts: v.optional(v.array(hiringContactV)),
  research: v.optional(researchV),
  prep: v.optional(prepV),
  appliedAt: v.optional(v.number()),
  updatedAt: v.number(),
};

export const jobV = v.object(jobFields);

/** A company worth approaching before it posts a role: a YC startup or one that just raised money. */
export const prospectFields = {
  /** Company name lowercased without punctuation, so the same company isn't saved twice. */
  key: v.string(),
  name: v.string(),
  website: v.string(),
  source: v.union(v.literal("yc"), v.literal("funded"), v.literal("vc"), v.literal("manual")),
  oneLiner: v.string(),
  industry: v.string(),
  location: v.string(),
  teamSize: v.optional(v.number()),
  /** YC batch, like "Summer 2024". */
  batch: v.optional(v.string()),
  ycUrl: v.optional(v.string()),
  logo: v.optional(v.string()),
  /** Latest round, like "Series A, $12M, Sept 2026, led by Accel". */
  funding: v.optional(v.string()),
  fundingSource: v.optional(v.string()),
  isHiring: v.optional(v.boolean()),
  fit: v.optional(v.object({ score: v.number(), reason: v.string(), angle: v.string() })),
  /** On your Dream 20: companies you'd love to work for, watched for openings. */
  dream: v.optional(v.boolean()),
  whyDream: v.optional(v.string()),
  /** Sales and GTM openings in India or remote at the last check. */
  openRoles: v.optional(v.number()),
  rolesCheckedAt: v.optional(v.number()),
  status: v.union(v.literal("new"), v.literal("approaching"), v.literal("talking"), v.literal("skip")),
  contacts: v.array(hiringContactV),
  updatedAt: v.number(),
};

export const prospectV = v.object(prospectFields);
