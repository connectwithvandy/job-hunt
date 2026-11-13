import { expect, test } from "vitest";
import { applyBoard } from "./lib/company";

test("names the board a job opens on, only for boards people apply through", () => {
  expect(applyBoard("https://www.naukri.com/job-listings-sdr-acme-bengaluru-123")).toBe("Naukri");
  expect(applyBoard("https://in.linkedin.com/jobs/view/4012345")).toBe("LinkedIn");
  expect(applyBoard("https://in.indeed.com/viewjob?jk=abc")).toBe("Indeed");
  expect(applyBoard("https://jobs.lever.co/acme/123")).toBeNull();
  expect(applyBoard("https://jobs.jobgether.com/offer/1")).toBeNull();
  expect(applyBoard("not a link")).toBeNull();
});
