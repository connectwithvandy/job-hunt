// Mutations that keep each person's usage totals right as their jobs change, so the owner's
// admin page reads a few small rows instead of every job. Any file that writes jobs imports
// `mutation` and `internalMutation` from here, not from _generated/server.
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel, Doc } from "../_generated/dataModel";
import { internalMutation as rawInternalMutation, mutation as rawMutation } from "../_generated/server";

/** What one job adds to its owner's totals. */
export function jobCounts(j: Doc<"jobs"> | null) {
  if (!j) return { jobs: 0, scored: 0, tailored: 0, applied: 0 };
  return { jobs: 1, scored: j.scores?.length ? 1 : 0, tailored: j.hasPack ? 1 : 0, applied: j.appliedAt ? 1 : 0 };
}

const triggers = new Triggers<DataModel>();

triggers.register("jobs", async (ctx, change) => {
  const before = jobCounts(change.oldDoc);
  const after = jobCounts(change.newDoc);
  const userId = (change.newDoc ?? change.oldDoc)!.userId;
  const d = { jobs: after.jobs - before.jobs, scored: after.scored - before.scored, tailored: after.tailored - before.tailored, applied: after.applied - before.applied };
  // Most job edits (a note, a score reason) change no total: no extra write.
  if (!d.jobs && !d.scored && !d.tailored && !d.applied) return;
  const row = await ctx.db.query("usageTotals").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  if (!row) {
    // A new member's first change starts their row, so Admin shows their usage the same day.
    // The nightly recount corrects it from the real numbers if anything was missed.
    await ctx.db.insert("usageTotals", { userId, jobs: Math.max(0, d.jobs), scored: Math.max(0, d.scored), tailored: Math.max(0, d.tailored), applied: Math.max(0, d.applied), countedAt: 0 });
    return;
  }
  await ctx.db.patch("usageTotals", row._id, {
    jobs: Math.max(0, row.jobs + d.jobs),
    scored: Math.max(0, row.scored + d.scored),
    tailored: Math.max(0, row.tailored + d.tailored),
    applied: Math.max(0, row.applied + d.applied),
  });
});

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
