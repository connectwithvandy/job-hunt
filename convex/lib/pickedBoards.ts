import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { CAREER_BOARDS, type CareerBoard } from "./careerBoards";

/** The hand-picked boards, with any page that moved (careersRefresh.heal) read at its new address. */
export async function pickedBoards(ctx: ActionCtx): Promise<CareerBoard[]> {
  const moves: { name: string; ats: CareerBoard["ats"]; slug: string }[] = await ctx.runQuery(internal.careers.moves, {});
  const moved = new Map(moves.map((m) => [m.name, m]));
  return CAREER_BOARDS.map((b) => {
    const m = moved.get(b.name);
    // careersUrl belonged to the old page.
    return m ? { name: b.name, website: b.website, ats: m.ats, slug: m.slug } : b;
  });
}
