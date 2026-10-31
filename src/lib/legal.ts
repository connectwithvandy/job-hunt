// The business details shown on the pricing, terms, privacy, refund and contact pages.
// Razorpay reads these pages before switching payments on. Fill in the empty ones before applying.

export const LEGAL = {
  product: "JobPipe",
  /** Your name, or a business name if you register one. */
  owner: "",
  email: "hello@jobpipe.in",
  phone: "",
  /** City and state is enough for now; Razorpay may ask for a full address. */
  address: "Bengaluru, Karnataka, India",
  site: "https://jobpipe.in",
  /** The founder, as shown on the landing page and in the welcome email. */
  founder: "Vandy",
  founderLinkedIn: "https://www.linkedin.com/in/meet-vandana/",
  updated: "31 October 2026",
};

export const PLANS = {
  trialDays: 7,
  full: 999,
  founding: 499,
  foundingSeats: 50,
  /** The Job Hunt Pass: one UPI payment for 3 months, no auto-renewal. */
  passMonths: 3,
  pass: 2499,
  foundingPass: 1299,
  /** Group seats for sales communities, bootcamps and outplacement, per seat per month. */
  seat: 599,
  minSeats: 10,
};

/** Shown in place of a detail that hasn't been filled in yet. */
export const missing = (v: string) => v || "[to be added]";
