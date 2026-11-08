// The business details shown on the pricing, terms, privacy, refund and contact pages.
// Razorpay reads these pages before switching payments on. Fill in the empty ones before applying.

export const LEGAL = {
  product: "JobPipe",
  /** Your name, or a business name if you register one. */
  owner: "Vandana Agarwal",
  email: "vandana@jobpipe.in",
  phone: "",
  /** City and state is enough for now; Razorpay may ask for a full address. */
  address: "Bengaluru, Karnataka, India",
  site: "https://jobpipe.in",
  /** The founder, as shown on the landing page and in the welcome email. */
  founder: "Vandy",
  founderLinkedIn: "https://www.linkedin.com/in/meet-vandana/",
  updated: "31 October 2026",
};

export { PLANS } from "../../convex/lib/plans";

/** Shown in place of a detail that hasn't been filled in yet. */
export const missing = (v: string) => v || "[to be added]";
