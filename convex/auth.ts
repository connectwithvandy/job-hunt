import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { resetEmail, sendEmail } from "./lib/email";

// "Forgot password": an 8-digit code by email, good for 15 minutes.
const ResetCode = Email({
  id: "password-reset",
  maxAge: 15 * 60,
  async generateVerificationToken() {
    return Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => n % 10).join("");
  },
  async sendVerificationRequest({ identifier, token }) {
    await sendEmail({ to: identifier, ...resetEmail(token) });
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // "Continue with Google" (26 Nov 2026): one tap on a phone, no password. Needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET,
  // and <CONVEX_SITE_URL>/api/auth/callback/google added to the Google client's redirect addresses.
  providers: [Password({ reset: ResetCode }), Google],
});
