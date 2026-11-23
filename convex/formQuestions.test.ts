import { describe, expect, test } from "vitest";
import { inventsNumbers, jobIdFromUrl, mustAnswerYourself, parseAshby, parseGreenhouse, parseLever, promptOptions, readableForm } from "./lib/formQuestions";

describe("reading application forms", () => {
  test("finds the job id in each board's link", () => {
    expect(jobIdFromUrl("https://job-boards.greenhouse.io/anthropic/jobs/5456619008", "greenhouse")).toBe("5456619008");
    expect(jobIdFromUrl("https://boards.greenhouse.io/embed/job_app?for=acme&token=123456", "greenhouse")).toBe("123456");
    expect(jobIdFromUrl("https://jobs.lever.co/mindtickle/203fff0a-f8cc-48cf-bc6f-fcd97a469674/apply", "lever")).toBe("203fff0a-f8cc-48cf-bc6f-fcd97a469674");
    expect(jobIdFromUrl("https://jobs.ashbyhq.com/wispr-flow/921f1bda-6472-463b-8eb4-b840f69a30a5", "ashby")).toBe("921f1bda-6472-463b-8eb4-b840f69a30a5");
    expect(jobIdFromUrl("https://jobs.lever.co/mindtickle", "lever")).toBeNull();
  });

  test("Greenhouse: keeps the custom questions, drops name, email and CV", () => {
    const qs = parseGreenhouse({
      questions: [
        { label: "First Name", required: true, fields: [{ type: "input_text" }] },
        { label: "Resume/CV", required: true, fields: [{ type: "input_file" }, { type: "textarea" }] },
        { label: "LinkedIn Profile", required: false, fields: [{ type: "input_text" }] },
        { label: "Why Anthropic?", required: true, fields: [{ type: "textarea" }] },
        { label: "Do you require visa sponsorship?", required: true, fields: [{ type: "multi_value_single_select", values: [{ label: "Yes" }, { label: "No" }] }] },
      ],
    });
    expect(qs).toEqual([
      { question: "Why Anthropic?", options: undefined, required: true, long: true },
      { question: "Do you require visa sponsorship?", options: ["Yes", "No"], required: true, long: false },
    ]);
  });

  test("Lever: reads the location picker and the custom cards", () => {
    const card = JSON.stringify({ text: "Questions", fields: [{ type: "textarea", text: "How many years selling new business?", required: true }] }).replace(/"/g, "&quot;");
    const html = `<select name="opportunityLocationId" class="x"><option value="">Select...</option><option value="a1">Bengaluru, Karnataka</option></select>
      <input type="hidden" value="${card}" name="cards[abc][baseTemplate]">`;
    expect(parseLever(html)).toEqual([
      { question: "Which location are you applying for?", options: ["Bengaluru, Karnataka"], required: true, long: false },
      { question: "How many years selling new business?", options: undefined, required: true, long: true },
    ]);
  });

  test("Ashby: yes/no questions become Yes and No options", () => {
    const qs = parseAshby({
      applicationForm: {
        sections: [
          {
            fieldEntries: [
              { field: { title: "Name", type: "String" }, isRequired: true },
              { field: { title: "Resume", type: "File" }, isRequired: true },
              { field: { title: "Are you legally authorized to work in the US?", type: "Boolean" }, isRequired: true },
            ],
          },
        ],
      },
    });
    expect(qs).toEqual([{ question: "Are you legally authorized to work in the US?", options: ["Yes", "No"], required: true, long: false }]);
  });

  test("legal and personal questions are left to the candidate", () => {
    expect(mustAnswerYourself("Please read the arbitration agreement below")).toBe(true);
    expect(mustAnswerYourself("Gender")).toBe(true);
    expect(mustAnswerYourself("Why Anthropic?")).toBe(false);
  });

  // Seen on Airtable's and Ramp's live forms, 23 Nov.
  test("drops upload-only questions and the legal name", () => {
    const gh = parseGreenhouse({
      questions: [
        { label: "Optional: Upload your AI example.", required: false, fields: [{ type: "input_file" }] },
        { label: "What are your compensation expectations?", required: true, fields: [{ type: "input_text" }] },
      ],
    });
    expect(gh.map((q) => q.question)).toEqual(["What are your compensation expectations?"]);
    const ashby = parseAshby({ applicationForm: { sections: [{ fieldEntries: [{ field: { title: "Legal Name", type: "String" }, isRequired: true }] }] } });
    expect(ashby).toEqual([]);
  });

  test("knows which forms can be read ahead", () => {
    expect(readableForm("https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd", "x", { ats: "lever", slug: "acme" })?.board.ats).toBe("lever");
    expect(readableForm("https://acme.com/careers/1", "careers:ashby:acme:921f1bda-6472-463b-8eb4-b840f69a30a5", null)).toEqual({
      board: { ats: "ashby", slug: "acme" },
      formLink: "https://jobs.ashbyhq.com/acme/921f1bda-6472-463b-8eb4-b840f69a30a5",
    });
    expect(readableForm("https://acme.wd1.myworkdayjobs.com/x", "x", { ats: "workday", slug: "acme" })).toBeNull();
    expect(readableForm("https://acme.com/jobs/1", "linkedin:1", null)).toBeNull();
  });

  test("a long option list is cut to what the CV names, plus Other", () => {
    const unis = ["Aalborg University", "Christ University", "University of Delhi", "Other"].concat(Array.from({ length: 60 }, (_, i) => `College ${i}`));
    expect(promptOptions(unis, '{"education":[{"school":"Christ University","degree":"BBA"}]}')).toEqual(["Christ University", "Other"]);
    expect(promptOptions(["Yes", "No"], "")).toEqual(["Yes", "No"]);
  });

  test("blanks numbers the candidate never gave", () => {
    const cv = '{"experience":[{"bullets":["Hit 112% of quota in 2023","Closed 1.2M ARR"]}],"start":"2019"}';
    // Quota questions: every number must be in the CV.
    expect(inventsNumbers("What is your % of quota attainment for each of the last 4 years?", "2023: 112%", cv)).toBe(false);
    expect(inventsNumbers("What is your % of quota attainment for each of the last 4 years?", "2023: 112%, 2022: 104%", cv)).toBe(true);
    expect(inventsNumbers("What's your stack rank and out of how many people?", "2 out of 15", cv)).toBe(true);
    // Elsewhere a small worked-out number is fine; money and percentages still need a source.
    expect(inventsNumbers("How many years of B2B sales experience do you have?", "6", cv)).toBe(false);
    expect(inventsNumbers("Tell us about a big win", "I closed 1.2M ARR", cv)).toBe(false);
    expect(inventsNumbers("Tell us about a big win", "I closed a 500k deal", cv)).toBe(true);
    expect(inventsNumbers("Do you have experience closing deals with an ACV of +$100K?", "Yes", cv)).toBe(false);
  });
});
