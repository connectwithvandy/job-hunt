// A track is one "game" you are playing: a family of roles with its own CV angle,
// pitch and outreach voice. Every job is scored against every active track.
export type Track = {
  id: string;
  name: string;
  color: string;
  status: "active" | "paused";
  /** Titles you'd accept, used to search job boards. */
  titles: string[];
  /** One line on how you want to come across for this track. Shapes CV headline and outreach. */
  pitch: string;
  /** Set for an internal-move track: only this company's roles, and notes go to colleagues. */
  company?: string;
};

export type ResumeExperience = {
  id: string;
  company: string;
  role: string;
  start: string;
  end: string;
  location: string;
  blurb: string;
  bullets: string[];
};

export type Resume = {
  name: string;
  headline: string;
  summary: string;
  contact: { phone: string; email: string; location: string; linkedin: string };
  photo?: string;
  experience: ResumeExperience[];
  education: { school: string; degree: string; detail: string; year: string; notes: string[] }[];
  certifications: { name: string; detail: string }[];
  skills: { technical: string[]; soft: string[] };
  extras: { title: string; items: { heading: string; text: string }[] }[];
};

export type TrackScore = {
  trackId: string;
  score: number;
  reason: string;
  gaps: string[];
};

export type JobStatus =
  | "new"
  | "applying"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "dismissed";

export type OutreachStatus = "draft" | "sent" | "replied" | "referred";

export type Outreach = {
  contactId: string;
  name: string;
  position: string;
  url: string;
  message: string;
  status: OutreachStatus;
  sentAt?: string;
  /** Raw note on what happened, written by you. */
  note?: string;
};

export type Pack = {
  trackId: string;
  createdAt: string;
  resume: Resume;
  coverLetter: string;
  hiringManagerTitles: string[];
  /** Numbers in the tailored CV that don't appear in your master CV. Should be empty. */
  unverified: string[];
};

export type Job = {
  id: string;
  source: "dreamwork" | "link" | "pasted";
  url: string;
  sourceUrl?: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  workSetting?: string;
  salary?: string;
  seniority?: string;
  postedAt?: string;
  addedAt: string;
  description?: string;
  /** Track whose search found this job. Scoring may move it. */
  foundFor?: string;
  scores?: TrackScore[];
  brief?: { whatTheyWant: string; watchOuts: string };
  trackId?: string;
  status: JobStatus;
  pack?: Pack;
  outreach: Outreach[];
  appliedAt?: string;
  updatedAt: string;
};

export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  url: string;
  email: string;
  company: string;
  position: string;
  connectedOn: string;
};
