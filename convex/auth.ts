import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { GenericId } from "convex/values";
import type { MutationCtx } from "./_generated/server";
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
  callbacks: {
    /**
     * One person, one account, whichever way they sign in (26 Nov 2026). Everyone before today signed up with a
     * password, and those emails were never marked confirmed, so by default "Continue with Google" with the same
     * email made a second, empty account. Google confirms the email, so it now opens the existing account.
     * The other way round stays closed: a new password sign-up can't take over an email that already has an
     * account, or anyone could claim someone's Google account by typing their email.
     */
    async createOrUpdateUser(ctx, args) {
      const { emailVerified: _ev, phoneVerified: _pv, ...profile } = args.profile as Record<string, unknown> & { email?: string; emailVerified?: boolean; phoneVerified?: boolean };
      void _ev;
      void _pv;
      if (args.existingUserId) return args.existingUserId;
      const db = ctx.db as unknown as MutationCtx["db"];
      const email = typeof profile.email === "string" ? profile.email.trim() : "";
      const sameEmail = async () => {
        if (!email) return null;
        for (const e of new Set([email, email.toLowerCase()])) {
          const user = await db.query("users").withIndex("email", (q) => q.eq("email", e)).first();
          if (user) return user;
        }
        return null;
      };
      if (args.type === "oauth") {
        const user = await sameEmail();
        if (user) {
          await db.patch(user._id, { emailVerificationTime: Date.now(), ...(!user.name && typeof profile.name === "string" ? { name: profile.name } : {}) });
          return user._id as GenericId<"users">;
        }
        return (await db.insert("users", { ...profile, emailVerificationTime: Date.now() })) as GenericId<"users">;
      }
      if (args.type === "credentials" && (await sameEmail())) {
        throw new ConvexError("This email already has a JobPipe account. Sign in instead, or use Continue with Google.");
      }
      return (await db.insert("users", profile)) as GenericId<"users">;
    },
  },
});
