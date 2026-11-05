import { expect, test } from "vitest";
import { cut, fitScore, isSeekerPost, isTechCompany, pitch, place } from "./growth";

test("job post places read cleanly", () => {
  expect(place("Pune-Maharashtra-India")).toBe("Pune");
  expect(place("Bengaluru, Karnataka, India")).toBe("Bengaluru");
  expect(place("Anywhere (Remote)")).toBe("Remote");
  expect(place("India Remote")).toBe("Remote");
  expect(place("Hybrid - Bengaluru")).toBe("Bengaluru");
});

test("hiring posts are left out of the open-to-work list", () => {
  expect(isSeekerPost("🚨 We’re hiring: Sales Development Representative (SDR) looking for", "Founder")).toBe(false);
  expect(isSeekerPost("I’m hiring an APJ BDR Leader. Looking for someone great", "Sales Leader")).toBe(false);
  expect(isSeekerPost("Open to work: looking for my next SDR role", "Recruiter & Sourcer")).toBe(false);
  expect(isSeekerPost("I'm looking for my next SDR role in Bengaluru", "SDR at Acme | SaaS")).toBe(true);
  expect(isSeekerPost("Open to work: Account Executive roles, India or remote", "Account Executive | B2B SaaS")).toBe(true);
  // Seen 3 Nov: job seekers tag #hiring for reach, and "IT Sales Professional" is a sales headline.
  expect(isSeekerPost("Hello LinkedIn Network! I am actively looking for opportunities as a Business Development executive in Mumbai #hiring", "IT Graduate | Aspiring Business Development & IT Sales Professional")).toBe(true);
});

test("only B2B sales and GTM people", () => {
  expect(isSeekerPost("OPEN TO WORK | Seeking ASM / RSM roles in solar across India", "Sales Manager, Solar Energy")).toBe(false);
  expect(isSeekerPost("Open to work in India, immediate joiner", "Admission & Business Development Leader | Test Prep")).toBe(false);
  expect(isSeekerPost("I'm looking for a sales role in Pune", "Software Engineer")).toBe(false);
});

test("seekers asking 'if you're hiring' are kept", () => {
  expect(isSeekerPost("I'm looking for my first SDR role in tech. If your team is hiring a hungry SDR, let's talk", "Sales Development Representative")).toBe(true);
  expect(isSeekerPost("OPEN TO WORK | exploring new opportunities. Know a company hiring for sales leaders?", "Sales Leader | GTM Strategy | B2B & Enterprise Sales")).toBe(true);
  expect(isSeekerPost("🚀 Hiring | Senior WordPress Developer. Looking for someone great", "Talent Acquisition Screener")).toBe(false);
});

test("only people talking about their own search, anywhere", () => {
  expect(isSeekerPost("Open to Work in Saudi Arabia | Sales, Business Development", "B2B Sales | Business Development")).toBe(true);
  expect(isSeekerPost("I'm looking for my first role in sales. Louisville", "Bartender")).toBe(false);
  expect(isSeekerPost("If you're looking out for a job as an SDR or AE in India, read this", "Director of Sales")).toBe(false);
});

test("the message fits a LinkedIn connect note", () => {
  expect(pitch("Ira M.").startsWith("Hi Ira,")).toBe(true);
  expect(pitch("PRAASHANT PRIYADARSHI").startsWith("Hi Praashant,")).toBe(true);
  expect(pitch("Manish Rangari").length).toBeLessThanOrEqual(300);
});

test("cutting text never splits an emoji", () => {
  const out = cut("ab🚀cd", 3);
  expect(out).toBe("ab🚀…");
  expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
});

// Real posts from 3 Nov: strong fits make the email, weaker ones don't.
test("strongest fits score 3 or more", () => {
  expect(fitScore("Three months into my job search, and I would rather be open about it than quiet. I am an SDR/BDR with 5+ years in SaaS. #opentowork", "BDR at Connectd | Executive Careers Expert")).toBeGreaterThanOrEqual(3);
  expect(fitScore("OPEN TO SENIOR SALES & COMMERCIAL LEADERSHIP OPPORTUNITIES I'm currently exploring my next professional opportunity #opentowork", "Sales Leader | Revenue Growth | GTM Strategy | B2B & Enterprise Sales")).toBeGreaterThanOrEqual(3);
  expect(fitScore("🚀 Open to Work | Exploring New Career Opportunities! I'm actively looking for new career opportunities in sales #saassales #b2bsales", "Business Development Specalist & Data Analyst")).toBeGreaterThanOrEqual(3);
});

test("weaker fits stay out", () => {
  expect(fitScore("Olá a todos – Estou em busca de vagas Home Office SDR/BDR. #OpenToWork", "SDR BDR da empresa Home Office")).toBeLessThan(3);
  expect(fitScore("I wasn't the person you'd expect to become a top sales performer. When I started at Octopus Energy, I wasn't particularly confident. I'm naturally an ambivert, a little more introverted than extroverted, and probably not the loudest in the room. #opentowork", "Technical Operations Analyst | B2B Sales & Commercial Experience")).toBeLessThan(3);
});

test("the LinkedIn post lists tech companies only", () => {
  // Seen 5 Nov: a pharma and a credit bureau led the post.
  expect(isTechCompany("Dr Reddy's Laboratories Limited", "Regional Sales Manager", "https://jobs.smartrecruiters.com/DrReddysLaboratoriesLimited/744000159072399")).toBe(false);
  expect(isTechCompany("Equifax", "Senior Manager Sales - North", "https://equifax.wd5.myworkdayjobs.com/External/job/IND-Delhi/AVP-Sales_J00179959")).toBe(false);
  expect(isTechCompany("Acme Finance", "Account Manager", "https://jobs.lever.co/acmefinance/1")).toBe(false);
  // Hand-picked, even on Workday or SmartRecruiters.
  expect(isTechCompany("Salesforce", "Account Executive", "https://salesforce.wd12.myworkdayjobs.com/External_Career_Site/job/1")).toBe(true);
  expect(isTechCompany("Canva", "Account Executive", "https://jobs.smartrecruiters.com/Canva/1")).toBe(true);
  // A startup board, even if not hand-picked.
  expect(isTechCompany("Wayground", "Team Lead, Account Executive (US)", "https://jobs.lever.co/Wayground/96a0cc02")).toBe(true);
  expect(isTechCompany("Newco", "SDR", "https://job-boards.greenhouse.io/newco/jobs/1")).toBe(true);
  expect(isTechCompany("Newco", "SDR", "https://jobs.ashbyhq.com/newco/1")).toBe(true);
});
