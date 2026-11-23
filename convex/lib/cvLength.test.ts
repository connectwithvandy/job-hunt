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

test("when the experience alone runs past two pages, leaves out only what may go and says how long it still is", () => {
  const long = cv(2, 9);
  const out = fitTwoPages(long, JOB);
  expect(out.pages).toBeGreaterThan(2);
  expect(out.resume.experience).toEqual(long.experience);
  expect(out.left.join(" ")).toMatch(/Cooking blog/);
});

test("never leaves out tools, awards, languages or leadership lines (owner's ServiceNow CV, 23 Nov)", () => {
  const long = cv(0, 5);
  long.extras = [
    { title: "Tools", items: [{ heading: "Sales", text: "Salesforce, Outreach, Gong" }] },
    { title: "Recognition", items: [{ heading: "100 Powerful Women in Sales", text: "Demandbase, 2025" }] },
    { title: "Languages", items: [{ heading: "Languages", text: "English, Hindi" }] },
    { title: "Side Projects", items: [
      { heading: "Co-founder & Host, SDR Leaders of APAC (250+ members)", text: "Invite-only network for SDR managers." },
      { heading: "Builder, Debrief", text: "Scores event conversations and drafts the follow up." },
    ] },
    { title: "Communities", items: [{ heading: "Member", text: "GrowthX" }, { heading: "Member", text: "Tenbound" }] },
  ];
  const out = fitTwoPages(long, JOB);
  const kept = out.resume.extras.flatMap((x) => x.items.map((i) => i.heading));
  for (const h of ["Sales", "100 Powerful Women in Sales", "Languages", "Co-founder & Host, SDR Leaders of APAC (250+ members)"]) expect(kept).toContain(h);
  expect(out.resume.education[0].notes).toEqual(expect.arrayContaining(["President, Entrepreneurship Cell", "Head, Cultural Committee"]));
  // "Member" lines go first, and say which community.
  expect(out.left.join(" ")).toMatch(/Member, GrowthX/);
});
