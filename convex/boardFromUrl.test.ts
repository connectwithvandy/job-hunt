import { expect, test } from "vitest";
import { boardFromUrl } from "./lib/boardFromUrl";

test("reads the four new careers systems from a job link", () => {
  expect(boardFromUrl("https://apply.workable.com/huggingface/j/DB4D7C0EC8/")).toEqual({ ats: "workable", slug: "huggingface" });
  expect(boardFromUrl("https://bunq.recruitee.com/o/security-engineer-3")).toEqual({ ats: "recruitee", slug: "bunq" });
  expect(boardFromUrl("https://acme.teamtailor.com/jobs/123-sdr")).toEqual({ ats: "teamtailor", slug: "acme.teamtailor.com" });
  expect(boardFromUrl("https://lucid.bamboohr.com/careers/15")).toEqual({ ats: "bamboohr", slug: "lucid" });
  expect(boardFromUrl("https://apply.workable.com/api/v3/accounts/x/jobs")).toBeNull();
  expect(boardFromUrl("https://www.bamboohr.com/pricing")).toBeNull();
});
