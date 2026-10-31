// The words that explain JobPipe to visitors, search engines and AI answer tools (ChatGPT, Perplexity, Google).
// One copy, used by the landing page, its structured data and /llms.txt, so they never disagree.
import { LEGAL, PLANS } from "./legal";

export const TITLE = "JobPipe: job search for sales and GTM roles, India and US";

export const DESCRIPTION =
  "Job search for sales and GTM roles in India, the US, APAC and EMEA. Every job scored against your CV, a tailored CV for each one, and who you know there.";

export const DEFINITION = `JobPipe is a job search tool for sales and go-to-market (GTM) professionals in India, the US, APAC and EMEA. You upload your CV and pick several target roles. Every morning it searches job boards and company careers pages, scores each job against each role with a reason, tailors your CV and cover letter without inventing facts, and shows who you know at each company. It is in waitlist beta: ${PLANS.trialDays}-day free trial, then ₹${PLANS.full}/month or ₹${PLANS.pass.toLocaleString("en-IN")} for a ${PLANS.passMonths}-month pass (₹${PLANS.founding}/month or ₹${PLANS.foundingPass.toLocaleString("en-IN")} for the first ${PLANS.foundingSeats} founding members). It is open source.`;

export const STEPS = [
  "Upload your CV and pick the sales roles you want.",
  "Every morning, JobPipe searches job boards and careers pages and scores every job.",
  "Get a tailored CV, cover letter and referral note for the jobs you like.",
  "Open Today: answer replies, apply, follow up, and try three new companies.",
];

export const FAQ: [string, string][] = [
  [
    "What is JobPipe?",
    "JobPipe is a job search tool for sales and GTM people that finds jobs, scores each one against your CV and tailors your application. Upload your CV and pick your target roles. Every morning it searches job boards and company careers pages, explains each score, drafts a tailored CV and cover letter, and shows who you know there.",
  ],
  [
    "How is JobPipe different from LinkedIn Jobs or Naukri?",
    "LinkedIn Jobs and Naukri list jobs; JobPipe works through them for you. It searches job boards and company careers pages every morning, scores each job against each role you want with a reason, and flags stale or ghost jobs. Then it tailors your CV, shows who you know at the company, and tracks your follow-ups.",
  ],
  [
    "Does JobPipe make up experience on my CV?",
    "No, JobPipe never invents experience on your CV. It reorders and trims the real facts from the CV you uploaded so the most relevant ones come first for each job. A fact check then flags any number that does not appear in your own CV, so you can catch it before you apply.",
  ],
  [
    "How much does JobPipe cost?",
    `JobPipe costs ₹${PLANS.full} a month after a ${PLANS.trialDays}-day free trial, or ₹${PLANS.pass.toLocaleString("en-IN")} once for a ${PLANS.passMonths}-month Job Hunt Pass with no auto-renewal. The first ${PLANS.foundingSeats} founding members pay ₹${PLANS.founding} a month or ₹${PLANS.foundingPass.toLocaleString("en-IN")} for the pass. Access is by waitlist during the beta, and payments are not switched on yet.`,
  ],
  [
    "Who is JobPipe for?",
    "JobPipe is for sales and go-to-market (GTM) people looking for their next role. That includes SDR and BDR leaders, Account Executives, GTM strategy and AI GTM roles, and sales leadership. It was built by a senior sales leader during a real job hunt, so it follows how sales people actually search: several roles at once.",
  ],
  [
    "Is my data safe? Does JobPipe read my Gmail?",
    "Your data is used only to run your job search, and we do not sell it or use it for ads. Connecting Gmail is optional and read-only: JobPipe reads recruiting emails and your calendar to update your applications, and cannot send, delete or change anything. You can disconnect anytime, or ask us to delete your account.",
  ],
  [
    "Which locations does JobPipe cover?",
    "JobPipe covers sales jobs in India and the US, and remote roles across APAC and EMEA. Set your city and it searches there: in an Indian city it shows that city, anywhere in India and remote roles open to India or APAC; in a US city, US roles. Every job is scored against your roles, so ones that don't fit sink to the bottom.",
  ],
  [
    "What does JobPipe do each day?",
    "JobPipe gives you a Today page with a short daily routine for your job search. Each morning it lists replies to answer, new jobs worth applying to, follow-ups that are due, and three new companies to look at. If you connect Gmail, recruiter replies show up there without you copying anything over.",
  ],
];

/** schema.org data for the landing page: what the app is, what it costs, and the FAQ. */
export function landingJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: LEGAL.product,
      url: LEGAL.site,
      description: DEFINITION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: [
        { "@type": "Offer", name: "Founding member", price: PLANS.founding, priceCurrency: "INR" },
        { "@type": "Offer", name: "Full", price: PLANS.full, priceCurrency: "INR" },
        { "@type": "Offer", name: "Job Hunt Pass (3 months)", price: PLANS.pass, priceCurrency: "INR" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: LEGAL.product,
      url: LEGAL.site,
      email: LEGAL.email,
      sameAs: ["https://github.com/connectwithvandy/job-hunt"],
      founder: { "@type": "Person", name: LEGAL.founder, jobTitle: "Sales leader", url: LEGAL.founderLinkedIn, sameAs: [LEGAL.founderLinkedIn] },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How JobPipe works",
      step: STEPS.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}
