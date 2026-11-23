import { expect, test } from "vitest";
import { applyBoard, formLink } from "./lib/company";

test("names the board a job opens on, only for boards people apply through", () => {
  expect(applyBoard("https://www.naukri.com/job-listings-sdr-acme-bengaluru-123")).toBe("Naukri");
  expect(applyBoard("https://in.linkedin.com/jobs/view/4012345")).toBe("LinkedIn");
  expect(applyBoard("https://in.indeed.com/viewjob?jk=abc")).toBe("Indeed");
  expect(applyBoard("https://jobs.lever.co/acme/123")).toBeNull();
  expect(applyBoard("https://jobs.jobgether.com/offer/1")).toBeNull();
  expect(applyBoard("not a link")).toBeNull();
});

test("formLink opens the form page on Ashby and Lever, leaves others alone", () => {
  expect(formLink("https://jobs.ashbyhq.com/coderabbit/cd4d11ac-70e0-408c-a6a3-f651d3e5e13f")).toBe("https://jobs.ashbyhq.com/coderabbit/cd4d11ac-70e0-408c-a6a3-f651d3e5e13f/application");
  expect(formLink("https://jobs.ashbyhq.com/ramp/707d5f91/application")).toBe("https://jobs.ashbyhq.com/ramp/707d5f91/application");
  expect(formLink("https://jobs.lever.co/palantir/6ed76ce8?lever-source=x")).toBe("https://jobs.lever.co/palantir/6ed76ce8/apply?lever-source=x");
  expect(formLink("https://job-boards.greenhouse.io/airtable/jobs/8403107002")).toBe("https://job-boards.greenhouse.io/airtable/jobs/8403107002");
  expect(formLink("not a url")).toBe("not a url");
});
