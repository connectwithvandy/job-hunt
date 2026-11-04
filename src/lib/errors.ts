import { ConvexError } from "convex/values";

/** The message to show a person when something fails. */
export function errorMessage(err: unknown) {
  if (err instanceof ConvexError) return String(err.data);
  // The browser lost its link to the server mid-request (sleep, Wi-Fi, a deploy). The work usually still finishes.
  if (err instanceof Error && CONNECTION_LOST.test(err.message)) return "The connection dropped. It may still finish: check again in a minute.";
  if (err instanceof Error && !/Server Error|Uncaught/.test(err.message)) return err.message;
  return "Something went wrong. Try again.";
}

// Unexpected errors go to the owner (convex/errors.ts). A person's own mistakes, shown as ConvexError messages
// like "Pick at least one person.", aren't bugs and stay out. Browser-extension noise stays out too.
let send: ((message: string) => void) | null = null;
const seen = new Set<string>();
const CONNECTION_LOST = /Connection lost while action was in flight/i;
const NOISE = /Connection lost while action was in flight|ResizeObserver loop|chrome-extension:|moz-extension:|^Script error\.?$|Failed to fetch|NetworkError|Load failed/i;

export function setErrorSender(fn: ((message: string) => void) | null) {
  send = fn;
}

export function reportError(err: unknown) {
  if (!send || err instanceof ConvexError) return;
  const message = err instanceof Error ? `${err.message}${err.stack ? `\n${err.stack.split("\n").slice(1, 4).join("\n")}` : ""}` : String(err);
  if (!message || NOISE.test(message) || seen.has(message) || seen.size > 20) return;
  seen.add(message);
  send(message);
}
