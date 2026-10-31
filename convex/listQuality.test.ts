import { expect, test } from "vitest";
import { regionsOf } from "../src/lib/regions";
import { payText } from "../src/lib/money";
import { cleanCompany, sameRoleKey } from "./lib/company";
import { quickFit } from "./lib/quickFit";
import { backOffice } from "./lib/salesRoles";

const nearBlr = (location: string, title = "Account Executive", workSetting?: string) => regionsOf({ location, title, workSetting }).includes("blr");

test("Bengaluru or remote leaves out field jobs in other Indian cities and remote jobs in one other country", () => {
  expect(nearBlr("INDIA > WEST BENGAL > KOLKATA : Remote")).toBe(false);
  expect(nearBlr("Remote - Tamil Nadu, India")).toBe(false);
  expect(nearBlr("Hyderabad, TS, India", "Account Executive", "remote")).toBe(false);
  expect(nearBlr("Remote", "Strategic Account Executive, France")).toBe(false);
  expect(nearBlr("Remote", "Territory Account Executive, Saskatchewan / Manitoba")).toBe(false);
});

test("Bengaluru or remote keeps Bengaluru, India-wide remote, and remote teams selling into other markets", () => {
  expect(nearBlr("Bengaluru, Karnataka")).toBe(true);
  expect(nearBlr("Remote (India)")).toBe(true);
  expect(nearBlr("Remote (Worldwide)")).toBe(true);
  expect(nearBlr("Remote", "Account Executive, SMB - EMEA/AMER")).toBe(true);
  expect(nearBlr("India - Remote", "Sales Development Manager - US")).toBe(true);
});

test("accounts and finance jobs are not sales jobs; key account jobs are", () => {
  for (const t of ["Executive-Accounts", "Accounts Executive", "Executive - Accounts Receivables", "Finance Executive – Accounts Payable & Taxation", "Lead - Revenue Accounting", "FP&A Manager – Revenue Operations"])
    expect(backOffice(t), t).toBe(true);
  for (const t of ["Account Executive", "Key Account Manager", "Key Accounts Manager- System Integrator", "Strategic Accounts Manager", "Lead - Sales Commission"]) expect(backOffice(t), t).toBe(false);
  expect(quickFit({ title: "Executive - Accounts", location: "Bengaluru" }, new Set(), ["Account Executive"], "Bengaluru, India")).toBeLessThan(10);
});

test("company names: escaped symbols fixed, hidden employers blank", () => {
  expect(cleanCompany("Eastman Auto u0026 Power")).toBe("Eastman Auto & Power");
  expect(cleanCompany("AT&amp;T")).toBe("AT&T");
  for (const n of ["Important Company of the Sector", "Leading", "Nameless", "Talent Acquisition Team", "Confidential", "T028"]) expect(cleanCompany(n), n).toBe("");
  expect(cleanCompany("Rippling")).toBe("Rippling");
});

test("the same role on two boards gets one key", () => {
  expect(sameRoleKey("HPE", "CloudOps Account Executive")).toBe(sameRoleKey("Hewlett Packard Enterprise", "CloudOps Account Executive"));
  expect(sameRoleKey("Lyric (lyric.tech)", "Applied AI / GTM Engineer")).toBe(sameRoleKey("Lyric", "Applied AI / GTM Engineer"));
  expect(sameRoleKey("Procucev Enterprise Solutions Pvt. Ltd.", "Senior Inside Sales Manager")).toBe(sameRoleKey("Procucev Enterprise Solutions", "Senior Inside Sales Manager (Bengaluru)"));
  expect(sameRoleKey("Smartsheet", "Manager, Revenue Operations Analytics / Revops (Hybrid- Bangalore) (Bangalore East)")).toBe(
    sameRoleKey("Smartsheet", "Manager, Revenue Operations Analytics / Revops (Hybrid- Bangalore)"),
  );
  expect(sameRoleKey("Rippling", "Sales Manager, Sales Development (UK)")).not.toBe(sameRoleKey("Rippling", "Sales Manager, Sales Development (AUS)"));
});

test("pay that can't be a year's pay is hidden", () => {
  expect(payText("USD 45 – 90/year", {})).toBeNull();
  expect(payText("45000-55000 per year", {})).toBeNull();
  expect(payText("₹60K/mo", {})).toBe("₹60K/mo");
  expect(payText("900000 per year", {})).toBe("900000 per year");
  expect(payText("116,000 – 145,000/year", {})).toBe("116,000 – 145,000/year");
});

test("long rupee pay reads in lakhs", () => {
  expect(payText("400000 per month", {})).toBe("₹4 L/month");
  expect(payText("₹1,400,000 – ₹2,400,000/year (est.)", {})).toBe("₹14–24 L/yr (est.)");
  expect(payText("INR 650000 per year", {})).toBe("₹6.5 L/yr");
  expect(payText("₹25 LPA", {})).toBe("₹25 LPA");
});
