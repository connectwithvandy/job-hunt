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
  updated: "31 October 2026",
};

export const PLANS = {
  trialDays: 7,
  full: 999,
  founding: 499,
  foundingSeats: 50,
};

/** Shown in place of a detail that hasn't been filled in yet. */
export const missing = (v: string) => v || "[to be added]";
