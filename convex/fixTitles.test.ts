/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("Sales Executive leaves Account Executive roles only; dry run changes nothing", async () => {
  const t = convexTest(schema, modules);
  const u = await t.run((ctx) => ctx.db.insert("users", {}));
  const track = (key: string, name: string, titles: string[]) => t.run((ctx) => ctx.db.insert("tracks", { userId: u, key, name, color: "#000", status: "active", titles, pitch: "" }));
  const ae = await track("account-executive", "Account Executive", ["Account Executive", "Sales Executive", "Enterprise Sales Executive"]);
  const sdr = await track("sdr", "SDR / BDR", ["SDR", "Sales Executive"]);
  expect(await t.mutation(internal.fixTitles.dropSalesExecutive, { dryRun: true })).toEqual({ tracks: 1, changed: 1 });
  expect((await t.run((ctx) => ctx.db.get(ae)))!.titles).toContain("Sales Executive");
  await t.mutation(internal.fixTitles.dropSalesExecutive, {});
  expect((await t.run((ctx) => ctx.db.get(ae)))!.titles).toEqual(["Account Executive", "Enterprise Sales Executive"]);
  expect((await t.run((ctx) => ctx.db.get(sdr)))!.titles).toEqual(["SDR", "Sales Executive"]);
});
