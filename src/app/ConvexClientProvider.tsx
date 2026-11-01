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
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
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
