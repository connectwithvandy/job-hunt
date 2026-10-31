import { expect, test } from "vitest";
import { cvSenior, juniorTitle, quickFit } from "./lib/quickFit";

const cv = (roles: { role: string; start: string; end: string }[]) => ({
  name: "Test",
  headline: "",
  summary: "",
  contact: { phone: "", email: "", location: "", linkedin: "" },
  experience: roles.map((r, i) => ({ id: `${i}`, company: "Acme", location: "", blurb: "", bullets: [], ...r })),
  education: [],
  certifications: [],
  skills: { technical: [], soft: [] },
  extras: [],
});

test("a manager or eight years of work reads as senior; a first job doesn't", () => {
  expect(cvSenior(cv([{ role: "Sales Development Manager", start: "Jan 2023", end: "Present" }]), 2026)).toBe(true);
  expect(cvSenior(cv([{ role: "Account Executive", start: "2018", end: "Present" }]), 2026)).toBe(true);
  expect(cvSenior(cv([{ role: "Business Development Representative", start: "Jun 2025", end: "Present" }]), 2026)).toBe(false);
  expect(cvSenior(cv([{ role: "Lead Generation Executive", start: "2025", end: "2026" }]), 2026)).toBe(false);
});

test("fresher, apprentice, intern and 0-1 years titles are junior", () => {
  for (const t of ["Business Development Representative (Fresher)", "BDR Support Apprentice", "Sales Intern", "SDR Trainee", "Graduate SDR", "Entry Level BDR", "Junior SDR", "BDR (0-1 years)", "SDR 0 to 2 yrs"]) expect(juniorTitle(t), t).toBe(true);
  for (const t of ["Business Development Representative", "Senior SDR", "SDR Manager", "Internal Sales Executive", "BDR (3-5 years)"]) expect(juniorTitle(t), t).toBe(false);
});

test("a fresher job falls below the line for someone senior, not for someone starting out", () => {
  const job = { title: "Business Development Representative (Fresher)", location: "Bengaluru, India" };
  const titles = ["Business Development Representative"];
  const starting = quickFit(job, new Set(), titles, "Bengaluru, India");
  const senior = quickFit(job, new Set(), titles, "Bengaluru, India", true);
  expect(starting).toBeGreaterThanOrEqual(60);
  expect(senior).toBeLessThan(60);
  // A job at their level isn't touched.
  expect(quickFit({ ...job, title: "Business Development Representative" }, new Set(), titles, "Bengaluru, India", true)).toBe(starting);
});
