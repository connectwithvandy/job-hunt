import { expect, test } from "vitest";
import { estimatePages, fitTwoPages, type CvShape } from "./cvLength";

const bullet = (topic: string) => `Built and ran the ${topic} motion across APAC, owning quota and forecast for a team of eight reps, and lifted results well past plan each quarter`;

function cv(extraItems: number, roles = 4): CvShape {
  return {
    headline: "SALES LEADER | SDR LEADER",
    summary: "Sales leader with years of outbound and closing experience. ".repeat(5),
    contact: { phone: "+91 00000 00000", email: "a@b.com", location: "Bengaluru", linkedin: "linkedin.com/in/x" },
    experience: Array.from({ length: roles }, (_, r) => ({ blurb: "", bullets: Array.from({ length: 6 }, (_, i) => bullet(`outbound ${r}${i}`)) })),
    education: [{ school: "NMIMS", degree: "PGDM", detail: "Sales & Marketing", notes: ["President, Entrepreneurship Cell", "Head, Cultural Committee", "Member, Toastmasters Intl Club"] }],
    certifications: [{ name: "MEDDICC", detail: "2024" }],
    skills: { technical: ["Salesforce", "Outreach", "Gong"], soft: ["Coaching"] },
    extras: [
      {
        title: "Side projects",
        items: Array.from({ length: extraItems }, (_, i) =>
          i === 0
            ? { heading: "Security pipeline playbook", text: "A cybersecurity outbound playbook for enterprise security buyers, used by AEs to close more deals." }
            : { heading: `Cooking blog ${i}`, text: "Weekend recipes and photography for friends and family, written in plain words with long stories about food." },
        ),
      },
    ],
  };
}

const JOB = "Sr Manager, Sales - Cybersecurity & Risk. Lead account executives closing enterprise security deals; forecast accuracy, territory planning, C-level meetings with security buyers.";

test("a longer CV estimates more pages", () => {
  expect(estimatePages(cv(0, 1))).toBeLessThan(estimatePages(cv(0, 4)));
  expect(estimatePages(cv(0, 1))).toBeLessThan(2);
});

test("a CV that already fits is left alone", () => {
  const short = cv(2, 1);
  const out = fitTwoPages(short, JOB);
  expect(out.resume).toBe(short);
  expect(out.left).toEqual([]);
});

test("leaves out the side items least related to the job first, and never touches experience", () => {
  const long = cv(14, 4);
  expect(estimatePages(long)).toBeGreaterThan(2);
  const out = fitTwoPages(long, JOB);
  expect(out.pages).toBeLessThanOrEqual(2);
  expect(out.resume.experience).toEqual(long.experience);
  expect(out.resume.summary).toBe(long.summary);
  // The one item about security stays; cooking goes.
  expect(out.resume.extras[0].items.map((i) => i.heading)).toContain("Security pipeline playbook");
  expect(out.left.length).toBeGreaterThan(0);
  expect(out.left.join(" ")).toMatch(/Cooking blog/);
  expect(out.left.join(" ")).toMatch(/kept \d+ of/);
});

test("cuts nothing when the experience alone runs past two pages, since cutting side items can't fix that", () => {
  const long = cv(2, 9);
  const out = fitTwoPages(long, JOB);
  expect(out.pages).toBeGreaterThan(2);
  expect(out.resume).toBe(long);
  expect(out.left).toEqual([]);
});
