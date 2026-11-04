// Pages for the searches sales people actually type ("SDR jobs India", "account executive jobs Bengaluru").
import type { RegionKey } from "./regions";

// Each is a real guide to the role plus how JobPipe helps; no made-up salaries or job counts.

export type RolePage = {
  slug: string;
  title: string; // the H1 and the search title
  description: string; // 140-160 characters, for Google
  intro: string;
  /** Explainer guides (not job lists) carry their own sections: a heading with text, a comparison table, or both. */
  sections?: { heading: string; text?: string; table?: { head: string[]; rows: string[][] } }[];
  looksFor?: string[];
  /** Heading over the live roles, when "Open roles right now" would be unclear on an explainer. */
  jobsHeading?: string;
  faq: [string, string][];
  /** Which live roles to list: titles searched the way the app searches them, and the regions that count. */
  jobs: { titles: string[]; regions: RegionKey[]; india: boolean; exclude?: RegExp };
};

export const ROLE_PAGES: RolePage[] = [
  {
    slug: "sdr-vs-bdr",
    title: "SDR vs BDR: what is the difference?",
    jobsHeading: "SDR and BDR roles open right now",
    description: "SDR vs BDR explained: inbound vs outbound, how each is measured, how both compare to an Account Executive, and which job titles to apply for.",
    intro:
      "An SDR (Sales Development Representative) usually works inbound leads, people who already showed interest, while a BDR (Business Development Representative) usually prospects outbound, reaching companies that have not. Both book meetings for Account Executives. Many companies use the two titles for the same job, so read the job description, not the title.",
    sections: [
      {
        heading: "SDR vs BDR vs Account Executive",
        table: {
          head: ["", "SDR", "BDR", "Account Executive (AE)"],
          rows: [
            ["Full title", "Sales Development Representative", "Business Development Representative", "Account Executive"],
            ["Main job", "Qualify people who came in and book meetings", "Find new companies and book meetings", "Run deals from first meeting to signed contract"],
            ["Leads", "Mostly inbound: demo requests, sign-ups, events", "Mostly outbound: cold email, calls, LinkedIn", "Meetings from SDRs and BDRs, plus their own"],
            ["Measured on", "Meetings booked, speed of follow-up, pipeline created", "Meetings booked, pipeline created from new accounts", "Revenue closed against quota"],
            ["Usual next step", "Account Executive", "Account Executive", "Senior or enterprise AE, or sales manager"],
          ],
        },
      },
      {
        heading: "How to tell which one a job really is",
        text: "Look for the words in the job description, not the title. 'Inbound', 'MQL', 'demo requests' and 'speed to lead' mean SDR-style work. 'Outbound', 'net new', 'cold calling', 'target accounts' and 'territory' mean BDR-style work. Many roles in India are a mix, and many sell into the US, UK or Australia on shifted hours, which the job description usually says.",
      },
      {
        heading: "Which one should you apply for?",
        text: "Both. Recruiters search for both titles, and the work overlaps enough that your CV can serve either. Put your strongest proof first: meetings booked and pipeline created against target, the channels you used, and the market you sold into. If you prefer outbound, lead with cold outreach that worked; if inbound, lead with speed and conversion.",
      },
    ],
    faq: [
      ["What does SDR stand for?", "Sales Development Representative. In sales, an SDR qualifies leads and books meetings for Account Executives. Outside sales, SDR can mean other things, such as the IMF's Special Drawing Rights."],
      ["What does BDR stand for?", "Business Development Representative. A BDR prospects new companies, usually outbound, and books meetings for Account Executives."],
      ["Is a BDR higher than an SDR?", "No. They are usually the same level, both entry roles in B2B sales, and both lead to Account Executive. Some companies pay outbound BDRs slightly more because the work is harder, but it depends on the company."],
      ["Is an SDR the same as inside sales?", "Not quite. Inside sales means selling remotely rather than in person. SDRs and BDRs are part of inside sales, but some inside sales roles also close small deals themselves."],
      ["Which is better for becoming an Account Executive, SDR or BDR?", "Both lead there. Outbound BDR work teaches you to create pipeline from nothing, which AE interviews often test. What matters most is hitting target consistently and getting close to deals."],
      ["Do SDR and BDR jobs need sales experience?", "Often not. Many companies hire freshers and career switchers. Show proof you can do the work: targets you hit, customer-facing jobs, cold outreach you have done and clear writing."],
    ],
    jobs: { titles: ["SDR", "BDR", "Sales Development Representative", "Business Development Representative"], regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "sdr-bdr-jobs-india",
    title: "SDR and BDR jobs in India and remote",
    description: "Sales Development Representative (SDR) and Business Development Representative (BDR) jobs in India and remote, updated every morning from company careers pages.",
    intro:
      "A Sales Development Representative (SDR) or Business Development Representative (BDR) finds and qualifies new buyers and books meetings for Account Executives. It is the most common way into B2B sales. Most openings are at SaaS companies in Bengaluru, Gurugram, Mumbai and Pune, plus remote roles selling into the US, EMEA and APAC.",
    looksFor: [
      "Meetings booked and pipeline created, with numbers and percentage of target.",
      "Outbound activity that worked: channels, sequences and reply rates.",
      "Tools: Salesforce or HubSpot, Outreach or Salesloft, LinkedIn Sales Navigator.",
      "Which market you sold into (US, EMEA, APAC) and to whom (SMB, mid-market, enterprise).",
    ],
    faq: [
      ["What is the difference between an SDR and a BDR?", "An SDR usually follows up on inbound leads and a BDR usually prospects outbound, but many companies use the two titles for the same job. Read the job description, not the title, to see which one it is."],
      ["What does an SDR do?", "An SDR researches target companies, reaches buyers by email, phone and LinkedIn, qualifies interest and books meetings for Account Executives. Day to day that means prospecting lists, outreach sequences, follow-ups and logging everything in the CRM, measured on meetings booked and pipeline created."],
      ["Are there remote SDR and BDR jobs in India?", "Yes. Many companies hire SDRs and BDRs remotely from India, usually to sell into the US, EMEA or APAC. The list on this page includes remote roles open to people in India, not just office roles."],
      ["Do SDR jobs in India sell to the US?", "Many do. A large share of SDR and BDR roles in Bengaluru and remote India sell into North America or EMEA, often on shifted hours. The job description usually says which region and time zone."],
      ["How does JobPipe help with SDR jobs?", "JobPipe searches job boards and company careers pages every morning, scores each SDR or BDR opening against your CV with a reason, tailors your CV without inventing anything, and shows who you know at the company."],
      ["How do I get an SDR job with no sales experience?", "Show proof you can do the work: customer-facing jobs, targets you hit, cold outreach you have done and clear writing. Many companies hire freshers and career switchers as SDRs, and a short note on why sales, plus a sample outreach email, helps you stand out."],
      ["How long does it take an SDR to become an Account Executive?", "Often 12 to 24 months, depending on the company and whether you hit target consistently. Ask in the interview how many SDRs moved to AE in the last year; it tells you how real the path is."],
      ["What happens in an SDR interview?", "Usually a recruiter call, a hiring manager round and a mock cold call or written outreach exercise. Prepare a 30-second pitch, your numbers against target and questions about the market you would sell into."],
      ["How do I find out what an SDR role pays?", "Ask the recruiter for the range early, including the split between fixed pay and variable (incentive) pay and how often variable is paid. Compare on-target earnings (fixed plus variable at 100% of target), not just the fixed part."],
    ],
    jobs: { titles: ["SDR", "BDR", "Sales Development Representative", "Business Development Representative"], regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "sdr-manager-jobs",
    title: "SDR manager and sales development leadership jobs",
    description: "SDR and BDR manager, head of sales development and team lead jobs in India, APAC and EMEA, scored against your CV with warm intros from JobPipe.",
    intro:
      "Sales development leadership roles (SDR team lead, SDR or BDR manager, head of sales development) are hired on team results, not personal quota. Many are in Bengaluru or remote, often building or running a team that sells into the US or EMEA.",
    looksFor: [
      "Team size, the team's attainment and how it changed under you.",
      "Pipeline your team created and how it converted to opportunities and revenue.",
      "Hiring, ramp time, coaching and promotions out of your team.",
      "Process you built: playbooks, territories, lead routing and handoff to AEs.",
    ],
    faq: [
      ["What do companies look for in an SDR manager?", "Proof that your team hit target, not just you: team size, attainment, pipeline created, ramp time and people promoted. A playbook or process you built and the tools you ran it on also count."],
      ["Are there remote SDR manager jobs in India?", "Yes. Many companies run sales development from India for the US or EMEA, and some hire the manager remotely. JobPipe shows remote roles open to India or APAC alongside Bengaluru ones."],
      ["Can JobPipe search several leadership titles at once?", "Yes. Each role you pick, such as SDR manager or head of sales development, gets its own search, CV and pipeline, and every job is scored against every role."],
      ["How do I move from SDR team lead to SDR manager?", "Show team results, not just your own: reps you coached, onboarding you ran and a process you built, with numbers. Leading a pod or standing in for a manager counts; say how many people and what changed."],
      ["What do SDR manager interviews ask?", "Expect questions on how you hire, ramp and coach reps, what you do when a rep misses target, how you work with AEs and marketing, and your team's numbers. Many companies also ask for a 30-60-90 day plan."],
      ["What should a 30-60-90 day plan for an SDR manager include?", "First month: learn the team, the market and the data. Second: fix the biggest gap you found. Third: set the targets and process for the next quarter. Keep it to one page and tie each step to a number."],
      ["Should an SDR manager's CV show individual quota?", "Briefly, if it shows how you earned the role. Lead with team attainment, pipeline created, ramp time and people promoted, because that is what the hiring manager is buying."],
    ],
    jobs: { titles: ["SDR Manager", "Sales Development Manager", "Head of Sales Development"], exclude: /\bbusiness development\b|\bcustomer development\b/i, regions: ["india", "apac", "europe", "mideast", "remote"], india: false },
  },
  {
    slug: "account-executive-jobs-bengaluru",
    title: "Account Executive jobs in Bengaluru, India and remote",
    description: "Account Executive (AE) jobs in Bengaluru, India and remote: SMB, mid-market and enterprise SaaS sales, updated every morning from company careers pages.",
    intro:
      "Account Executives (AEs) own deals from first meeting to signed contract. Bengaluru has the biggest share of SaaS AE roles in India, from SMB and mid-market to enterprise, with more remote roles covering APAC and the Middle East.",
    looksFor: [
      "Quota and attainment over several quarters or years, as numbers.",
      "Deal size, sales cycle length and the segment you sold to.",
      "New logos versus expansion, and the industries you sold into.",
      "Forecast accuracy and the CRM you ran your pipeline in.",
    ],
    faq: [
      ["What does an Account Executive do?", "An Account Executive (AE) runs deals from first meeting to signed contract: discovery calls, demos, proposals, negotiation and closing. AEs carry a revenue quota and are measured on what they close, often with SDRs booking some of their meetings."],
      ["Are there remote Account Executive jobs in India?", "Yes. Some SaaS companies hire AEs remotely from India, usually to cover India, APAC or the Middle East. The list on this page includes remote roles open to people in India alongside Bengaluru ones."],
      ["What is a full-cycle Account Executive?", "A full-cycle AE finds their own pipeline as well as closing it, instead of relying only on meetings booked by SDRs. Many startup AE roles in India are full cycle."],
      ["How do I show I'm ready for an enterprise AE role?", "Show deal sizes, cycle length, multi-threading and quota attainment in numbers. JobPipe's tailored CV puts the proof a job asks for first, using only facts from your own CV."],
      ["Does JobPipe apply to AE jobs for me?", "No. JobPipe finds and scores jobs, tailors your CV and drafts referral notes, but you apply yourself. Recruiters are wary of bot applications, so this keeps your applications credible."],
      ["How do I move from SDR to Account Executive?", "Hit target consistently, sit in on AE discovery calls and demos, and run a few deals end to end if your company allows it. On your CV, show meetings that turned into pipeline and any deals you closed."],
      ["What is the difference between SMB, mid-market and enterprise AE roles?", "Mostly deal size, cycle length and the number of buyers. SMB AEs run many small, fast deals; enterprise AEs run a few large deals over months with many stakeholders; mid-market sits between."],
      ["What happens in an Account Executive interview?", "Usually a recruiter call, a hiring manager round and a mock discovery call or deal presentation, sometimes with a panel. Bring your attainment by year, one deal from first call to close, and how you build your own pipeline."],
      ["What is OTE in an Account Executive offer?", "On-target earnings: fixed pay plus the variable pay you earn at 100% of quota. Ask for the split, the quota, how many reps hit it last year and whether commission is capped."],
    ],
    jobs: { titles: ["Account Executive", "Enterprise Account Executive", "Mid Market Account Executive"], exclude: /\bkey account\b|executive\s*-\s*account management|\btalent account\b/i, regions: ["blr", "india", "remote"], india: true },
  },
  {
    slug: "sales-leadership-jobs-india",
    title: "Sales manager and sales leadership jobs in India",
    description: "Sales manager, regional sales manager and head of sales jobs in India and remote APAC, scored against your CV, with warm referral notes from JobPipe.",
    intro:
      "Sales leadership roles, from sales manager and regional sales manager to head of sales, are hired on team numbers and how you built the team. Many are filled through referrals, so who you know at the company matters as much as the CV.",
    looksFor: [
      "Team quota and attainment, team size and the region you ran.",
      "Revenue growth you drove and the plays behind it.",
      "Hiring, coaching and how you cut ramp time.",
      "Forecasting, pipeline reviews and cross-team work with marketing and customer success.",
    ],
    faq: [
      ["How are sales leadership jobs usually filled?", "Often through referrals and recruiters before or alongside a public posting. JobPipe shows who you know at each company from your LinkedIn connections and drafts a referral note for the best person to ask."],
      ["Should my CV be different for a sales manager role?", "Yes. Lead with team results: team size, attainment, growth and people you developed, instead of your own deals. JobPipe tailors the order and wording for each job without inventing facts."],
      ["Does JobPipe cover jobs outside Bengaluru?", "Yes. It shows jobs in your city, anywhere in India and remote roles open to India or APAC, and scores each one against the roles you want."],
      ["How do I move from team lead to sales manager?", "Show that the team did better because of you: attainment before and after, people you hired or coached, and a process you put in place. Taking on hiring, forecasting or a pod of reps before the title helps make the case."],
      ["What happens in a head of sales interview?", "Expect rounds with senior leaders and often the founder or CEO, questions on how you would build and run the team, and frequently a plan or presentation for your first quarter. Reference checks are common at this level."],
      ["How much do references matter for sales leadership roles?", "A lot. Companies often call former managers and people who reported to you. Line up two or three before you start interviewing and tell them what the role is about."],
      ["What should I ask before leading sales at an early-stage startup?", "Ask how much revenue and pipeline exist today, whether the founder still sells, how many deals were won without the founder, and the budget to hire. You may be the first sales hire, building from scratch."],
    ],
    jobs: { titles: ["Head of Sales", "Sales Director", "VP Sales", "Regional Sales Manager"], regions: ["india"], india: true },
  },
  {
    slug: "gtm-jobs-india",
    title: "GTM strategy and AI GTM jobs in India",
    description: "Go-to-market (GTM) strategy, GTM operations and AI GTM jobs in India and remote APAC. JobPipe scores each against your CV and finds who can refer you.",
    intro:
      "Go-to-market (GTM) roles sit between sales, marketing and strategy: planning segments and territories, building outbound and launch plays, and more and more, running AI tools across the sales process. Titles vary a lot, so one search rarely finds them all.",
    looksFor: [
      "GTM plays you designed and the pipeline or revenue they produced.",
      "Segmentation, territory or pricing work, with numbers.",
      "Tools and automation, including AI tools you rolled out to sales teams.",
      "Working across sales, marketing, product and RevOps.",
    ],
    faq: [
      ["What is a GTM role?", "A go-to-market (GTM) role plans how a company finds and wins customers: which segments to target, how to reach them and how sales and marketing work together. Titles include GTM strategy, GTM operations and founder's office GTM."],
      ["Why are GTM jobs hard to search for?", "The titles vary: GTM strategy, revenue strategy, growth, founder's office and AI GTM can all describe similar work. JobPipe reads the job description, not just the title, and scores it against your roles."],
      ["Can I search GTM and sales roles together?", "Yes. Pick several roles and each gets its own search, CV and pipeline, so a GTM strategy job and an SDR leadership job are each judged on their own terms."],
      ["How do I move from sales into a GTM strategy role?", "Show work beyond your own quota: playbooks you wrote, segment or territory analysis, tools you rolled out and launches you ran, with results. Founder's office and RevOps roles are common bridges."],
      ["What is a founder's office GTM role?", "A role that works closely with the founder on whatever growth needs next: new markets, sales plays, partnerships or hiring. It is broad and fast-moving, and most common at startups."],
      ["What skills do AI GTM roles ask for?", "Using AI tools for research, outreach and call review, building simple automations, and showing measured results such as time saved or a change in reply rates. Something you built or rolled out counts more than a list of tools."],
      ["What is the difference between GTM operations and RevOps?", "They overlap. RevOps usually owns the CRM, data, reporting and process across sales, marketing and customer success; GTM operations often adds planning and launch work. Read the job description, not the title."],
    ],
    jobs: { titles: ["GTM", "Go To Market", "Revenue Operations", "Sales Operations"], regions: ["india"], india: true, exclude: /\bbilling\b|,\s*AP\b|\bproduct management\b|\bpricing\b|\baccount executive\b/i },
  },
  {
    slug: "sales-jobs-usa",
    title: "SDR, Account Executive and sales leadership jobs in the US",
    description: "SDR, BDR, Account Executive and sales manager jobs in the US, scored against your CV with a reason. JobPipe tailors your CV and shows who can refer you.",
    intro:
      "The US has the largest market for B2B sales jobs, from SDR and BDR roles to Account Executives and sales leadership. Many are in-office or hybrid in hubs like New York, San Francisco, Austin and Boston; remote roles are often limited to US residents.",
    looksFor: [
      "Quota attainment as numbers, ideally over several quarters, and your rank on the team.",
      "Pipeline, deal size and sales cycle, and the segment you sold to.",
      "The CRM and sales tools you used, such as Salesforce, HubSpot, Outreach and Gong.",
      "Work authorisation and location, since many US roles require both.",
    ],
    faq: [
      ["Does JobPipe search US sales jobs?", "Yes. Set a US city and JobPipe searches job boards and company careers pages there every morning, then scores each job against the roles you want with a reason."],
      ["Are US remote sales jobs open to people outside the US?", "Usually not. Most US remote sales roles require US residence or work authorisation. JobPipe reads the location and job description and flags roles that rule you out."],
      ["How should a CV for a US sales job look?", "One page if you have under 10 years of experience, results first, and numbers in every bullet: quota, attainment, pipeline and deal size. JobPipe reorders your real facts for each job and never invents numbers."],
      ["Can I apply for US sales jobs from India?", "Only if the role sponsors a visa or says it hires outside the US; most need US work authorisation. Remote roles open to India or APAC are usually a more realistic route."],
      ["What is a typical US sales interview process?", "A recruiter screen, a hiring manager round, a mock call or deal presentation and often a panel or leadership round. Many companies also check references before an offer."],
      ["Should a US sales CV include a photo or date of birth?", "No. US employers expect no photo, age or marital status on a CV. Keep it to results, roles, dates and skills."],
      ["What does a US sales offer usually include?", "A base salary plus commission, together called on-target earnings (OTE), and often benefits such as health insurance and sometimes equity. Ask for the quota, how many reps hit it last year, any ramp period and whether commission is capped."],
    ],
    jobs: { titles: ["Account Executive", "Sales Development Representative", "Sales Manager", "Account Manager"], regions: ["us"], india: false },
  },
  {
    slug: "remote-sales-jobs-apac",
    title: "Remote sales jobs for India, APAC and EMEA",
    description: "Remote SDR, AE and sales leadership jobs open to India, APAC and EMEA. JobPipe filters out roles you can't take and scores the rest against your CV.",
    intro:
      "Many remote sales jobs are only remote within the US or Europe. JobPipe looks for roles that are actually open to people in India or APAC, and flags ones where the location rules you out.",
    looksFor: [
      "Experience selling into the region the role covers.",
      "Working across time zones and with remote teams.",
      "Results in numbers: pipeline, quota and attainment.",
      "Clear written communication, since most of the job happens in writing.",
    ],
    faq: [
      ["How do I find remote sales jobs open to India?", "Check the location line and the job description for the countries or time zones allowed. JobPipe does this for you and shows remote roles open to India or APAC next to the jobs in your city."],
      ["Are remote sales jobs paid in rupees?", "It depends on the company and whether they hire through an Indian entity, an employer-of-record service or as contractors. The job description or the recruiter will say."],
      ["Does JobPipe include EMEA remote jobs?", "Yes, when they are open to your location. Every job is scored against your roles, so ones that don't fit sink to the bottom."],
      ["What hours do remote APAC and EMEA sales jobs expect from India?", "Usually the customers' business hours. APAC roles often follow Singapore or Sydney time, which means mornings in India, and EMEA roles mean afternoons and evenings. Ask how many overlapping hours the team expects."],
      ["What is an employer of record?", "A company that legally employs you in your country for a foreign employer, handling your salary, tax and benefits. Many remote roles open to India hire this way."],
      ["How do I stand out for a remote sales job?", "Show you have already sold remotely: the regions you covered, deals run over video and email, and results in numbers. A short, well-written note matters, since most of the job happens in writing."],
      ["Do remote sales jobs involve travel?", "Some do, for customer visits, events or a yearly kickoff. The job description usually says; if not, ask the recruiter how often and where."],
    ],
    jobs: { titles: ["Account Executive", "Sales Development Representative", "Sales Manager", "Business Development"], regions: ["apac"], india: false },
  },
];

/** When the guide text last changed. Shown on each guide and given to search engines; move it on when you edit a guide. */
export const GUIDES_UPDATED = "2026-11-04";
