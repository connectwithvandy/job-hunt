"use client";

import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { FREE, PLANS } from "../../convex/lib/plans";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { api } from "../../convex/_generated/api";
import { Onboarding } from "./Onboarding";
import { Celebrations } from "./Celebrate";
import { ChatButton, inProfile, ProfileMenu, SubTabs, TopBar } from "./Sidebar";
import { SurveyPopup } from "./SurveyPopup";
import { SignIn } from "./SignIn";
import { Spinner } from "./ui";
import { Waitlist } from "./Waitlist";

const PUBLIC = ["/pricing", "/terms", "/privacy", "/refunds", "/contact", "/cv-review", "/compare", "/about"];

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
/** Says plainly what stopped and how to turn it back on, so a blocked button is never a surprise. */
function TrialOverNotice() {
  const account = useQuery(api.access.mine);
  if (!account?.trialOver) return null;
  return (
    <div className="card mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <p className="text-ink-2">
        Your trial has ended, so you&apos;re on the free plan: daily jobs, your tracker, {FREE.scoresPerDay} fit scores a day and {FREE.tailorsTotal} tailored CV to try. Research, interview prep, messages and the chat need a pass.
      </p>
      <Link href="/billing" className="btn btn-primary btn-sm">
        Get the Job Hunt Pass · from ₹{PLANS.foundingPass}
      </Link>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const access = useQuery(api.access.status, isAuthenticated ? {} : "skip");
  // Asked alongside access, not after it, so the app opens one round trip sooner. It only returns your own profile.
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const path = usePathname();
  // The server can't see sign-ins, so it renders the landing page. That way search engines and AI crawlers
  // that don't run JavaScript read the real page, not a spinner. Returning visitors get the spinner instead.
  const returning = useSyncExternalStore(noSubscribe, hasSession, () => false);

  // Pricing and the policy pages are for everyone, signed in or not.
  // /p/ pages are the daily LinkedIn post's job links, /tools/ the free OTE calculator: both showed the sign-up page
  // instead of themselves until 26 Nov 2026.
  if (PUBLIC.includes(path) || ["/sales-jobs", "/p/", "/tools/"].some((p) => path.startsWith(p))) return <>{children}</>;
  // Only the home page needs that: on a job link or any other app page the landing page would flash
  // for a moment before the app appears (the first paint can't see the saved sign-in yet).
  if (isLoading && !returning && path === "/") return <SignIn />;
  if (isLoading || (isAuthenticated && (access === undefined || (access?.approved && me === undefined)))) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-3">
        <Spinner />
      </div>
    );
  }
  // A job's apply link from the LinkedIn post (/apply/CODE): sign up first, then they go on to the job (26 Nov 2026).
  if (!isAuthenticated || !access) return <SignIn note={path.startsWith("/apply/") ? "Sign up free to apply to this job. Once you're in, the job opens straight away." : undefined} />;
  if (!access.approved) return <Waitlist email={access.email} onWaitlist={access.onWaitlist} answered={access.answered} rejected={access.rejected} />;
  if (!me) return <SignIn />;
  if (!me.onboarded) return <Onboarding me={me} />;

  // The CV print view, and the small window the autofill bookmark opens.
  const bare = (path.startsWith("/jobs/") && path.endsWith("/resume")) || path === "/fill";
  return (
    <div className="min-h-screen">
      {!bare && <TopBar isOwner={me.isOwner} />}
      {/* Room at the bottom so the floating Ask JobPipe button never sits on the last line. */}
      <main className="mx-auto min-w-0 max-w-7xl px-4 pt-6 pb-24 md:px-8 md:pt-8 md:pb-24 print:p-0">
        {!bare && <TrialOverNotice />}
        {!bare && <SubTabs />}
        {!bare && inProfile(path) ? (
          <div className="md:flex md:gap-10">
            <ProfileMenu />
            {/* Profile pages start at the same left edge whatever their width: each centred itself, so the heading
                jumped sideways from one menu item to the next (19 Nov walk). */}
            <div className="min-w-0 flex-1 [&>*]:mx-0!">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
      {!bare && <ChatButton />}
      {!bare && <SurveyPopup />}
      <Celebrations />
    </div>
  );
}
