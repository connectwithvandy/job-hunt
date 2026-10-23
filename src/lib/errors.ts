import { ConvexError } from "convex/values";

/** The message to show a person when something fails. */
export function errorMessage(err: unknown) {
  if (err instanceof ConvexError) return String(err.data);
  if (err instanceof Error && !/Server Error|Uncaught/.test(err.message)) return err.message;
  return "Something went wrong. Try again.";
}
