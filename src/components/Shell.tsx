"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { api } from "../../convex/_generated/api";
import { Onboarding } from "./Onboarding";
import { ChatButton, Sidebar, SubTabs } from "./Sidebar";
import { SignIn } from "./SignIn";
import { Spinner } from "./ui";
import { Waitlist } from "./Waitlist";

const PUBLIC = ["/pricing", "/terms", "/privacy", "/refunds", "/contact"];

/** Whether this browser has signed in before (Convex Auth keeps a refresh token in localStorage). */
function hasSession() {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("__convexAuthRefreshToken"));
  } catch {
    return false;
  }
}
const noSubscribe = () => () => {};

/** Signed out: the landing page. Not let in yet: the waitlist. Signed in but new: onboarding. Otherwise the app. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const access = useQuery(api.access.status, isAuthenticated ? {} : "skip");
  const me = useQuery(api.users.me, access?.approved ? {} : "skip");
  const path = usePathname();
  // The server can't see sign-ins, so it renders the landing page. That way search engines and AI crawlers
  // that don't run JavaScript read the real page, not a spinner. Returning visitors get the spinner instead.
  const returning = useSyncExternalStore(noSubscribe, hasSession, () => false);

  // Pricing and the policy pages are for everyone, signed in or not.
  if (PUBLIC.includes(path)) return <>{children}</>;
  if (isLoading && !returning) return <SignIn />;
  if (isLoading || (isAuthenticated && (access === undefined || (access?.approved && me === undefined)))) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-3">
        <Spinner />
      </div>
    );
  }
  if (!isAuthenticated || !access) return <SignIn />;
  if (!access.approved) return <Waitlist email={access.email} onWaitlist={access.onWaitlist} answered={access.answered} />;
  if (!me) return <SignIn />;
  if (!me.onboarded) return <Onboarding me={me} />;

  const bare = path.startsWith("/jobs/") && path.endsWith("/resume");
  return (
    <div className="min-h-screen md:flex">
      {!bare && <Sidebar isOwner={me.isOwner} />}
      <main className="min-w-0 flex-1 px-5 py-8 md:px-12 md:py-12 print:p-0">
        {!bare && <SubTabs />}
        {children}
      </main>
      {!bare && <ChatButton />}
    </div>
  );
}
