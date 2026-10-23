"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { Onboarding } from "./Onboarding";
import { Sidebar } from "./Sidebar";
import { SignIn } from "./SignIn";
import { Spinner } from "./ui";

/** Signed out: the landing page. Signed in but new: onboarding. Otherwise the app. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const path = usePathname();

  if (isLoading || (isAuthenticated && me === undefined)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-3">
        <Spinner />
      </div>
    );
  }
  if (!isAuthenticated || !me) return <SignIn />;
  if (!me.onboarded) return <Onboarding me={me} />;

  const bare = path.startsWith("/jobs/") && path.endsWith("/resume");
  return (
    <div className="min-h-screen md:flex">
      {!bare && <Sidebar />}
      <main className="min-w-0 flex-1 px-5 py-8 md:px-12 md:py-12 print:p-0">{children}</main>
    </div>
  );
}
