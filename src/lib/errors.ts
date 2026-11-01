import { ConvexError } from "convex/values";

/** The message to show a person when something fails. */
export function errorMessage(err: unknown) {
  if (err instanceof ConvexError) return String(err.data);
  if (err instanceof Error && !/Server Error|Uncaught/.test(err.message)) return err.message;
  return "Something went wrong. Try again.";
}

// Unexpected errors go to the owner (convex/errors.ts). A person's own mistakes, shown as ConvexError messages
// like "Pick at least one person.", aren't bugs and stay out. Browser-extension noise stays out too.
let send: ((message: string) => void) | null = null;
const seen = new Set<string>();
const NOISE = /ResizeObserver loop|chrome-extension:|moz-extension:|^Script error\.?$|Failed to fetch|NetworkError|Load failed/i;

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
