import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
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
  providers: [Password({ reset: ResetCode })],
});
