import { expect, test } from "vitest";
import { cut, fitScore, isSeekerPost, isTechCompany, jobLine, mixJobs, place, plainComment, postedInLastDay, postGroup } from "./growth";

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

test("the plain comment uses the first name and reads like a comment", () => {
  expect(plainComment("Ira M.").startsWith("Ira, job hunting")).toBe(true);
  expect(plainComment("PRAASHANT PRIYADARSHI").startsWith("Praashant,")).toBe(true);
  expect(plainComment("").startsWith("Job hunting")).toBe(true);
  expect(plainComment("Manish Rangari")).toContain("https://jobpipe.in");
});

test("packaging and printing sales people stay out", () => {
  // Seen 6 Nov: passed over by hand.
  expect(isSeekerPost("Open to new opportunities in Printing & Packaging. #opentowork", "Key Account Manager - Printing & Packaging | B2B Sales")).toBe(false);
});

test("the post means the last 24 hours", () => {
  const now = Date.parse("2026-11-06T03:45:00Z");
  expect(postedInLastDay("2026-11-05T10:00:00Z", now)).toBe(true);
  expect(postedInLastDay("2026-11-05T03:00:00Z", now)).toBe(false);
  // A date with no time: yesterday counts, the day before doesn't.
  expect(postedInLastDay("2026-11-05", now)).toBe(true);
  expect(postedInLastDay("2026-11-04", now)).toBe(false);
  expect(postedInLastDay(undefined, now)).toBe(false);
  expect(postedInLastDay("not a date", now)).toBe(false);
});

test("jobs sort into SDRs, AEs and sales managers", () => {
  expect(postGroup("Senior Business Development Representative")).toBe("sdr");
  expect(postGroup("Inside Sales Executive")).toBe("sdr");
  expect(postGroup("Enterprise Account Executive")).toBe("ae");
  expect(postGroup("Sales Manager")).toBe("manager");
  expect(postGroup("SDR Team Lead")).toBe("manager");
  expect(postGroup("Business Development Manager")).toBe("manager");
  // Seen 6 Nov: taken out by hand before posting.
  expect(postGroup("Solution Consultant - Veeva QualityOne - India")).toBe(null);
  expect(postGroup("Sales Operations Manager")).toBe(null);
  expect(postGroup("Key Account Manager")).toBe(null);
});

test("the post is half SDRs, half AEs and sales managers", () => {
  const jobs = (title: string, n: number) => Array.from({ length: n }, () => ({ title }));
  const picked = mixJobs([...jobs("SDR", 10), ...jobs("Account Executive", 4), ...jobs("Sales Manager", 4)], 6).map((j) => postGroup(j.title));
  expect(picked.filter((g) => g === "sdr").length).toBe(3);
  expect(picked.filter((g) => g === "ae").length).toBe(2);
  expect(picked.filter((g) => g === "manager").length).toBe(1);
  // Few SDRs: the other side fills the post.
  expect(mixJobs([...jobs("SDR", 1), ...jobs("Account Executive", 9)], 6).length).toBe(6);
  expect(mixJobs(jobs("Account Manager", 5), 6).length).toBe(0);
});

test("a job line shows the place once", () => {
  expect(jobLine({ company: "Paytm", title: "KAM - Manager - Paytm Ads (Mumbai)", where: "Mumbai", url: "u" })).toBe("• Paytm, KAM - Manager - Paytm Ads (Mumbai)\nu");
  expect(jobLine({ company: "Acme", title: "SDR (EMEA)", where: "Remote", url: "u" })).toBe("• Acme, SDR (EMEA) (Remote)\nu");
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
