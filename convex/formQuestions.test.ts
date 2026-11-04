import { describe, expect, test } from "vitest";
import { jobIdFromUrl, mustAnswerYourself, parseAshby, parseGreenhouse, parseLever } from "./lib/formQuestions";

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
});
