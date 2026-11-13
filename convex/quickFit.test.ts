import { describe, expect, it, test } from "vitest";
import { cvSenior, juniorTitle, quickFit } from "./lib/quickFit";
import { placeFit } from "./lib/places";

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

describe("place and work type follow the person's choices", () => {
  const titles = ["Account Executive"];
  const ae = (location: string, workSetting?: string) => ({ title: "Account Executive", location, workSetting });
  it("a role abroad stays low, however well the title fits", () => {
    expect(quickFit(ae("Berlin; Munich (Remote)", "remote"), new Set(), titles, "India")).toBeLessThan(40);
    expect(quickFit(ae("New York, NY"), new Set(), titles, "Bengaluru")).toBeLessThan(40);
    expect(quickFit(ae("Bengaluru, Karnataka, India"), new Set(), titles, "Bengaluru")).toBeGreaterThanOrEqual(60);
  });
  it("counts every city they picked, not just the first", () => {
    expect(placeFit(ae("Pune, Maharashtra, India"), "Bengaluru, Pune")).toBe(1);
    expect(placeFit(ae("Gurgaon, Haryana"), "Gurugram")).toBe(1);
    expect(placeFit(ae("Mumbai, India"), "Bengaluru")).toBeLessThan(0.5);
  });
  it("remote means open to someone in India", () => {
    expect(placeFit(ae("Remote (United States)", "remote"), "Remote")).toBe(0);
    expect(placeFit(ae("India (Remote)", "remote"), "Remote")).toBe(1);
    expect(placeFit(ae("US (Remote)", "remote"), "Anywhere")).toBe(0);
    expect(placeFit(ae("London, UK"), "Anywhere")).toBe(1);
  });
  it("a work type they didn't pick counts for less", () => {
    const office = quickFit(ae("Bengaluru, India", "remote"), new Set(), titles, "Bengaluru", false, ["onsite", "hybrid"]);
    const any = quickFit(ae("Bengaluru, India", "remote"), new Set(), titles, "Bengaluru");
    expect(office).toBeLessThan(any);
  });
});

test("field sales, a bare Sales Manager and side functions sit below a plain sales title", () => {
  const titles = ["Sales Manager", "Business Development Manager", "Account Manager", "Partner Manager"];
  const fit = (title: string) => quickFit({ title, location: "Bengaluru, India" }, new Set(), titles, "Bengaluru");
  const plain = fit("Business Development Manager");
  expect(fit("Area Sales Manager")).toBeLessThan(plain);
  expect(fit("Senior Sales Manager")).toBeLessThan(plain);
  expect(fit("Sales Manager II")).toBeLessThan(plain);
  expect(fit("Partner Manager")).toBeLessThan(plain);
});
