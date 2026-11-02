"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { reportError, setErrorSender } from "@/lib/errors";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Sends crashes and unexpected errors to the owner, who gets them by email within the hour. */
function ErrorReporter() {
  const report = useMutation(api.errors.report);
  useEffect(() => {
    setErrorSender((message) => void report({ message, page: location.pathname }).catch(() => {}));
    // Only crashes in JobPipe's own code. Browser add-ons and in-app browsers inject scripts that break on their own.
    const onError = (e: ErrorEvent) => {
      if (e.filename && !e.filename.includes("/_next/")) return;
      reportError(e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (/extension:\/\//.test(String((e.reason as Error | undefined)?.stack ?? ""))) return;
      reportError(e.reason);
    };
    addEventListener("error", onError);
    addEventListener("unhandledrejection", onRejection);
    return () => {
      setErrorSender(null);
      removeEventListener("error", onError);
      removeEventListener("unhandledrejection", onRejection);
    };
  }, [report]);
  return null;
}

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <ErrorReporter />
      {children}
    </ConvexAuthProvider>
  );
}
