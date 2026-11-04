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
  /** Heading over the questions, when "Questions people ask" would be unclear (interview guides). */
  faqHeading?: string;
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
    slug: "sdr-interview-questions",
    title: "SDR interview questions and answers (2026)",
    jobsHeading: "SDR and BDR roles open right now",
    faqHeading: "SDR interview questions, with how to answer",
    description: "Common SDR and BDR interview questions with how to answer each, how the mock cold call works, and what to ask the hiring manager before you say yes.",
    intro:
      "Most SDR and BDR interviews test three things: whether you can take rejection, whether you can talk and write clearly to a stranger, and whether you are coachable. Below are the questions that come up most, with how to answer each, and how to handle the mock cold call.",
    sections: [
      {
        heading: "How SDR interviews usually run",
        text: "First a recruiter screen: why sales, why this company, notice period and pay expectations. Then a hiring manager round on motivation, any numbers you have and how you handle objections. Most companies add a role play, a mock cold call or a written outreach email. Some end with a short call with a sales leader or an Account Executive.",
      },
      {
        heading: "The mock cold call",
        text: "Open politely and say why you are calling, tied to something real about their company. Ask one good question instead of pitching features. When they object, acknowledge it, ask one follow-up question, and try once more. Close by asking for a meeting at a specific time. Interviewers mostly judge your calm, your listening and whether you ask for the meeting, not whether you win.",
      },
      {
        heading: "Questions to ask the interviewer",
        text: "How many SDRs hit target last quarter? How many moved to Account Executive in the last year? What is the split between inbound and outbound? Which market and time zone will I sell into? How long is the ramp before full target? Which tools does the team use?",
      },
    ],
    faq: [
      ["Why do you want to be an SDR?", "Be specific: you like talking to new people, you are motivated by a clear target, and you want a path into B2B sales and then Account Executive. Add one real example, such as a target you hit or a time you convinced someone."],
      ["Tell me about a time you faced rejection.", "Pick a real example, say what you did next and what changed. Interviewers want proof that a no does not stop you, and that you learn from it rather than taking it personally."],
      ["How would you research a prospect before reaching out?", "Check the company's site, news, hiring and funding, then the person's role and recent LinkedIn activity. Pick one thing that connects to the problem your product solves, and use it in your first line. Keep research to a few minutes per prospect."],
      ["How would you write a cold email to a prospect?", "Short, about them, and with one ask: a first line tied to something real about their company, one sentence on a problem you solve for teams like theirs, and a simple question or a request for 15 minutes. No attachments and no long product description."],
      ["How do you handle 'We are not interested'?", "Acknowledge it, then ask one question to learn why, for example what they use today. If there is no fit, thank them and ask if you can check back later. Never argue."],
      ["How do you handle 'Just send me an email'?", "Agree, then ask one question so the email is useful: what would make it worth reading. Often that question restarts the conversation. Send the email the same day and refer to the call."],
      ["How would you plan your day as an SDR?", "Block time for research, outreach and follow-ups, put calls when buyers pick up, and keep the CRM up to date as you go. Mention that you would track your own numbers each week, not just activity."],
      ["Tell me about a target you hit or missed.", "Give the number, the time period and what you did. If you missed, say why and what you changed. Freshers can use a college, part-time or customer-facing target."],
      ["What do you know about our product and who buys it?", "Say who the buyer is, the problem they solve and one or two competitors, in your own words. Check their site, customer stories and job posts before the interview."],
      ["Where do you see yourself in two years?", "As an Account Executive, or on the way to it, after hitting target consistently as an SDR. It shows ambition that matches how SDR teams are built."],
      ["How do you take feedback?", "Give a real example of feedback you got, what you changed, and the result. Coachability is one of the main things SDR managers hire for."],
      ["Sell me this pen.", "Do not list features. Ask questions first: when did they last use a pen, what for, what annoyed them. Then tie the pen to the need they described, and ask for the sale."],
      ["Do I need sales experience to get an SDR job?", "Often not. Many companies hire freshers and career switchers. Show customer-facing work, targets you hit, outreach you have done and clear writing, and prepare well for the mock call."],
    ],
    jobs: { titles: ["SDR", "BDR", "Sales Development Representative", "Business Development Representative"], regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "sales-interview-questions",
    title: "Sales interview questions and answers (2026)",
    jobsHeading: "Sales roles open right now",
    faqHeading: "Sales interview questions, with how to answer",
    description: "Common sales interview questions for SDR, BDR and Account Executive roles, with how to answer each, how role plays work, and questions to ask back.",
    intro:
      "Sales interviews check whether you can find and win business, handle a no, and talk honestly about your numbers. These are the questions that come up most for B2B sales roles, from SDR to Account Executive, with how to answer each.",
    sections: [
      {
        heading: "How sales interviews usually run",
        text: "A recruiter screen, then a hiring manager round on your numbers and how you sell, then a role play: a mock cold call for SDRs, a discovery call or deal presentation for Account Executives. Senior roles often add a panel or a final round with a sales leader.",
      },
      {
        heading: "Talking about your numbers",
        text: "Know your quota or target and your attainment for each year or quarter, your average deal size and sales cycle, and how much pipeline you built yourself. Be exact and do not round up: interviewers check. If you missed, say by how much, why and what you changed.",
      },
      {
        heading: "Questions to ask back",
        text: "What share of the team hit quota last year? Where do leads come from, and how much pipeline am I expected to build myself? What is the territory? How long is ramp? Why is this role open?",
      },
    ],
    faq: [
      ["Tell me about yourself.", "Two minutes: where you sell now, who to, one result with a number, and why this role is the next step. Leave out your full history; they have your CV."],
      ["Why sales?", "Give a real reason: you like the target, the people, being paid for results. Back it with an example of something you sold or a target you hit."],
      ["Walk me through your numbers.", "Quota and attainment by year or quarter, deal size, cycle length and segment. Say where the pipeline came from. Have the figures ready without looking them up."],
      ["Tell me about a deal you won.", "Pick one deal and tell it from first contact to signature: who the buyer was, their problem, who else was involved, the hardest moment and how you got past it, and the final size."],
      ["Tell me about a deal you lost.", "Be honest about why you lost and what you would do differently. Interviewers want self-awareness, not a story where nothing was your fault."],
      ["How do you build pipeline?", "Name your channels (outbound email, calls, LinkedIn, referrals, events), how you choose target accounts, and a number such as meetings or pipeline you created in a quarter."],
      ["How do you run a discovery call?", "Agree the agenda, ask about their current process, the problem, its cost, who decides and by when, then agree a clear next step. Most of the call should be them talking."],
      ["How do you handle price objections?", "Ask what they are comparing the price to, go back to the cost of the problem they described, and trade rather than discount: anything you give should get something back, such as a longer term or a faster signature."],
      ["Sell me this pen.", "Ask questions before pitching: how they use pens, what bothers them. Tie the pen to the need they gave you, then ask for the sale. The test is whether you discover before you pitch."],
      ["How do you handle rejection?", "Give a real example, what you did next and the result. Show you keep going and learn from it without taking it personally."],
      ["How do you forecast your deals?", "Explain the stages you use, what has to be true for a deal to move stage, and how close your past forecasts were. Mention the CRM you ran your pipeline in."],
      ["Why are you leaving your current job?", "Keep it forward-looking: bigger deals, a better market, a clearer path. Do not criticise your current company."],
      ["What are your salary expectations?", "Ask for the range first. If you must answer, give total pay (OTE) with the fixed and variable split you expect, based on your current pay and the market."],
      ["How do I answer sales interview questions as a fresher?", "Use examples from college, internships, part-time jobs or anything with a target or a customer. Prepare for the role play, research the company, and show you are coachable."],
    ],
    jobs: { titles: ["Account Executive", "SDR", "BDR", "Sales Development Representative"], exclude: /\bkey account\b|executive\s*-\s*account management|\btalent account\b/i, regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "sdr-salary-india",
    title: "SDR salary in India (2026)",
    jobsHeading: "SDR and BDR roles open right now",
    description: "What SDRs and BDRs earn in India in 2026: typical total pay, fixed vs variable, what moves pay up or down, and what to ask before accepting an offer.",
    intro:
      "SDRs and BDRs at SaaS companies in India typically earn ₹10–22 lakh a year in total pay (fixed plus variable), from what I have seen working in sales development. How much of that is fixed depends on the company. Freshers, and roles selling only into India, often start lower.",
    sections: [
      {
        heading: "What moves SDR pay up or down",
        text: "The market you sell into matters most: roles selling into the US, UK or Europe usually pay more than roles selling into India. Then the company: funded or global SaaS companies tend to pay more than small local firms. Experience, outbound versus inbound work, and US or UK shift hours also change the offer.",
      },
      {
        heading: "Fixed pay, variable pay and OTE",
        text: "SDR offers are usually quoted as OTE, on-target earnings: fixed pay plus the variable pay you earn at 100% of target. Variable is usually paid monthly or quarterly on meetings held or pipeline created. Two offers with the same OTE can be very different if one is mostly fixed and the other mostly variable.",
      },
      {
        heading: "What to ask before you accept",
        text: "Ask for the fixed and variable split, what the target is and how it is measured, how many SDRs hit target last quarter, how often variable is paid, whether there are accelerators above target, and how long the ramp period is before full target applies.",
      },
    ],
    faq: [
      ["What is the average SDR salary in India?", "Most SDR and BDR roles at SaaS companies pay around ₹10–22 lakh a year in total pay, fixed plus variable. Fresher roles and roles selling only into India often start below that range."],
      ["Do SDRs get commission?", "Yes, as variable pay tied to meetings held or pipeline created, not closed revenue. It is usually paid monthly or quarterly and is part of the OTE quoted in the offer."],
      ["Do SDRs selling to the US earn more?", "Usually, yes. Roles selling into the US, UK or Europe tend to pay more than India-only roles, and often involve shifted working hours. Ask whether a shift allowance or transport is included."],
      ["How much more does an Account Executive earn than an SDR?", "A clear step up. AEs at SaaS companies in India typically earn ₹17–30 lakh a year in total pay, with a larger share as variable tied to closed revenue."],
      ["Is SDR a good job in India?", "For people who want a B2B sales career, yes: it is the most common way into SaaS sales, pay is good for an entry role, and most companies promote strong SDRs to Account Executive within one to two years."],
      ["How do I negotiate an SDR offer?", "Compare offers on OTE and on how achievable the target is, not just fixed pay. Ask how many SDRs hit target last quarter, and negotiate the fixed part if the variable looks hard to earn."],
    ],
    jobs: { titles: ["SDR", "BDR", "Sales Development Representative", "Business Development Representative"], regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "account-executive-salary-india",
    title: "Account Executive salary in India (2026)",
    jobsHeading: "Account Executive roles open right now",
    description: "What Account Executives earn in India in 2026: typical total pay, OTE and commission, what changes pay, and what to ask about quota before accepting.",
    intro:
      "Account Executives (AEs) at SaaS companies in India typically earn ₹17–30 lakh a year in total pay (fixed plus variable), from what I have seen working in sales. How much of that is fixed depends on the company. Enterprise roles at large global software companies often pay more; SMB and India-only roles often pay less.",
    sections: [
      {
        heading: "What moves AE pay up or down",
        text: "Segment and deal size come first: enterprise AEs running large, long deals usually earn more than SMB AEs closing many small ones. The market you sell into, the company's size and funding, and your record against quota also move the offer.",
      },
      {
        heading: "OTE, commission and quota",
        text: "AE offers are quoted as OTE, on-target earnings: fixed pay plus commission at 100% of quota. AEs usually carry a bigger variable share than SDRs, paid on closed revenue. The quota decides whether that variable is real: an OTE is only worth what the team actually hits.",
      },
      {
        heading: "What to ask before you accept",
        text: "Ask for the fixed and variable split, the quota and how it was set, what share of AEs hit quota last year, whether commission is capped, whether there are accelerators above quota, any clawbacks, and how long the ramp is before full quota applies.",
      },
    ],
    faq: [
      ["What is the average Account Executive salary in India?", "Most AE roles at SaaS companies pay around ₹17–30 lakh a year in total pay, fixed plus variable. Enterprise roles at large global companies often pay more, and SMB or India-only roles often less."],
      ["What is OTE for an Account Executive?", "On-target earnings: fixed pay plus the commission you earn at 100% of quota. Ask for the split, because two offers with the same OTE can carry very different risk."],
      ["How is AE commission paid?", "As a share of the revenue you close, usually paid monthly or quarterly once the deal is signed or paid. Many plans pay more per rupee above quota (accelerators); some cap it."],
      ["What share of AEs hit quota?", "It varies widely by company, which is why you should ask. If few AEs on the team hit quota last year, the variable part of the OTE is unlikely, and the fixed part is what you should compare."],
      ["How much does pay go up from SDR to AE?", "A clear step up: SDRs at SaaS companies in India typically earn ₹10–22 lakh a year in total pay, AEs ₹17–30 lakh, with more of it tied to closed revenue."],
      ["Do remote AE roles for global companies pay more?", "Often, when they sell into the US, UK, Europe or the Middle East. Check the currency, whether you are an employee or a contractor, and who pays for benefits."],
    ],
    jobs: { titles: ["Account Executive", "Enterprise Account Executive", "Mid Market Account Executive"], exclude: /\bkey account\b|executive\s*-\s*account management|\btalent account\b/i, regions: ["blr", "india", "remote"], india: true },
  },
  {
    slug: "inside-sales-jobs-india",
    title: "Inside sales jobs in India and remote",
    description: "Inside sales jobs in India and remote: inside sales representative and executive roles at software and B2B companies, updated every morning.",
    intro:
      "Inside sales means selling by phone, email and video instead of meeting buyers in person. In B2B and software companies, inside sales roles range from SDRs who book meetings to inside sales executives who close smaller deals themselves. Most openings are in Bengaluru, Pune, Gurugram, Mumbai and Hyderabad, plus remote roles.",
    looksFor: [
      "Activity and results with numbers: calls, meetings, deals closed and percentage of target.",
      "Clear speaking and writing, because every conversation is remote.",
      "A CRM you have worked in, such as Salesforce, HubSpot or Zoho.",
      "The market and buyer you sold to, and the deal size.",
    ],
    faq: [
      ["What is inside sales?", "Selling remotely, by phone, email and video calls, rather than visiting customers. Most B2B software sales in India is inside sales."],
      ["What is the difference between inside sales and field sales?", "Inside sales works remotely and handles more, usually smaller, deals. Field sales meets customers in person, often for larger accounts or in industries like manufacturing and pharma."],
      ["Is inside sales the same as an SDR job?", "Not always. SDRs book meetings for Account Executives. Some inside sales roles also close deals themselves, especially for smaller customers. Read the job description to see which it is."],
      ["Do inside sales jobs need experience?", "Many entry roles hire freshers who speak and write well and have hit any kind of target. Experienced roles ask for a record against quota."],
      ["Are there work-from-home inside sales jobs?", "Yes. Inside sales suits remote work, and many companies hire remote inside sales staff in India, often for US, UK or APAC markets on shifted hours."],
    ],
    jobs: { titles: ["Inside Sales Representative", "Inside Sales Executive", "Inside Sales Manager", "Inside Sales"], regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "saas-sales-jobs-india",
    title: "SaaS, tech and B2B sales jobs in India",
    description: "SaaS, tech and B2B sales jobs in India and remote: SDR, Account Executive, pre-sales and account management roles at software companies, updated daily.",
    intro:
      "SaaS sales means selling software that customers pay for by subscription, usually to other businesses (B2B). The main roles are SDR or BDR (booking meetings), Account Executive (closing deals), Solutions Engineer (the technical side) and Account Manager (growing existing customers). Bengaluru has the most openings in India, followed by Gurugram, Mumbai, Pune and Hyderabad.",
    sections: [
      {
        heading: "The main SaaS sales roles",
        table: {
          head: ["Role", "What they do", "Measured on"],
          rows: [
            ["SDR / BDR", "Finds and qualifies new buyers, books meetings", "Meetings and pipeline created"],
            ["Account Executive", "Runs deals from first meeting to signed contract", "Revenue closed against quota"],
            ["Solutions Engineer", "Demos, technical questions, proofs of concept", "Deals won with the AE"],
            ["Account Manager", "Renewals, upsell and expansion with existing customers", "Retention and expansion revenue"],
          ],
        },
      },
      {
        heading: "How SaaS sales differs from other sales",
        text: "Deals are recurring, so companies care about how long customers stay, not just the first sale. Sales is mostly inside sales, done over video calls. Teams are split by stage (SDR, AE, account management), and pay is usually fixed plus variable against a target.",
      },
    ],
    faq: [
      ["How do I get into SaaS sales with no experience?", "Most people start as an SDR or BDR. Show targets you hit, customer-facing work, clear writing and outreach you have done, and learn the basics of how software is bought."],
      ["Is tech sales the same as SaaS sales?", "Mostly. Tech sales covers all technology sold to businesses, including hardware and services; SaaS sales is the software-subscription part, and the biggest share of tech sales jobs in India."],
      ["What does B2B sales mean?", "Business to business: selling to companies rather than to individual consumers. Deals involve several people and take longer, and SaaS is one of the largest B2B sales markets."],
      ["What do SaaS sales jobs pay in India?", "From what I have seen, SDRs at SaaS companies typically earn ₹10–22 lakh a year in total pay and Account Executives ₹17–30 lakh, fixed plus variable. Freshers and India-only roles often start lower."],
      ["Which cities have the most SaaS sales jobs in India?", "Bengaluru, then Gurugram, Mumbai, Pune, Hyderabad and Chennai. Many companies also hire remote sales staff in India to sell into the US, UK, Europe or APAC."],
    ],
    jobsHeading: "SaaS sales roles open right now",
    jobs: { titles: ["Account Executive", "Sales Development Representative", "Solutions Engineer", "Account Manager"], exclude: /\bkey account\b|executive\s*-\s*account management|\btalent account\b/i, regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "business-development-jobs-india",
    title: "Business development jobs in Bengaluru and India",
    description: "Business development jobs in Bengaluru, India and remote: BDR, business development executive and manager roles at B2B and software companies.",
    intro:
      "Business development jobs find and open new business: new customers, new markets or new partners. In B2B and software companies, entry roles (Business Development Representative or Executive) book meetings for sales, and manager roles own new accounts, partnerships or a region.",
    looksFor: [
      "New business you created, with numbers: meetings, pipeline, deals or partners signed.",
      "The market, industry and buyer you worked with.",
      "Outreach that worked: channels, messages and conversion.",
      "For managers: territory or partner results, and any team you led.",
    ],
    faq: [
      ["What does a business development executive do?", "Finds potential customers, reaches out by phone, email and LinkedIn, qualifies their interest and books meetings or closes smaller deals, depending on the company."],
      ["Is business development the same as sales?", "Closely related. Business development usually means opening new opportunities (customers, markets, partners); sales usually means closing them. Many companies use the titles loosely, so read the job description."],
      ["What is the difference between a BDR and a business development manager?", "A BDR is an entry role that books meetings. A business development manager is more senior and usually owns new accounts, partnerships or a region, and may lead a team."],
      ["Do business development jobs need an MBA?", "Most B2B and software business development roles do not. Proof of results (meetings, pipeline, deals) matters more than the degree."],
    ],
    jobs: { titles: ["Business Development Representative", "Business Development Executive", "Business Development Manager", "Head of Business Development"], regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "presales-jobs-india",
    title: "Pre-sales and solutions engineer jobs in India",
    description: "Pre-sales, solutions engineer and sales engineer jobs in India and remote at software companies: what the role is, what it needs, and open roles.",
    intro:
      "Pre-sales (Solutions Engineer, Sales Engineer, Presales Consultant) is the technical side of selling software: understanding the buyer's needs, giving demos, answering technical questions and running proofs of concept alongside the Account Executive.",
    looksFor: [
      "Deals you helped win, with size and what you did in them.",
      "Products you can demo and the technical depth behind them.",
      "Proofs of concept you ran and how they turned out.",
      "How you work with Account Executives and product teams.",
    ],
    faq: [
      ["What does a pre-sales consultant do?", "Works with the sales team to win deals: discovery on technical needs, tailored demos, answering security and integration questions, and running trials or proofs of concept."],
      ["What is the difference between a solutions engineer and a sales engineer?", "Usually the same job; companies pick one title. Both support sales on the technical side rather than carrying the quota alone."],
      ["Do I need to code for a pre-sales job?", "Not always, but you need to understand how the product works and explain it clearly. Some roles ask for scripting, APIs or cloud basics."],
      ["Can I move from pre-sales to sales?", "Yes. Many solutions engineers move into Account Executive or sales leadership roles, because they already know the buyer and the deal process."],
    ],
    jobs: { titles: ["Solutions Engineer", "Sales Engineer", "Presales Consultant", "Solutions Consultant"], exclude: /\btesting\b|\bnetwork\b|\bqa\b|\bsupport\b|\bimplementation\b/i, regions: ["india", "blr", "remote"], india: true },
  },
  {
    slug: "sales-resume",
    title: "Sales resume: how to write one that gets calls (SDR, BDR, AE)",
    faqHeading: "Sales resume questions",
    jobsHeading: "Sales roles to try it on",
    description: "How to write a sales resume for SDR, BDR and Account Executive jobs in India: format, the numbers to show, bullet examples, and common mistakes.",
    intro:
      "A sales resume has one job: prove you can hit a number. Hiring managers skim for targets, attainment, pipeline and deal size, so put those first, in numbers, near the top. Here is what to include for SDR, BDR and Account Executive roles, and what to leave out.",
    sections: [
      {
        heading: "What to show for each role",
        table: {
          head: ["Role", "Lead with", "Also show"],
          rows: [
            ["SDR / BDR", "Meetings booked and pipeline created against target", "Channels, reply rates, market sold into, tools"],
            ["Account Executive", "Quota and attainment by year", "Deal size, cycle length, segment, new vs expansion"],
            ["Fresher", "Any target you hit, customer-facing work", "Outreach you have done, clear writing, why sales"],
          ],
        },
      },
      {
        heading: "Format that works",
        text: "One page, two if you have over eight years. Name, phone, email and LinkedIn at the top. A two-line summary of the role you want and your best number. Then experience, newest first, three to five bullets per job, each starting with a result. Skills and tools at the end. Save as PDF unless the form asks for Word.",
      },
      {
        heading: "Bullets: before and after",
        text: "Before: 'Responsible for outbound prospecting and lead generation.' After: 'Booked 40 qualified meetings a quarter from outbound email and calls to US mid-market companies, 115% of target.' (Use your own real numbers; these are only examples.) Before: 'Handled enterprise accounts.' After: 'Closed ₹1.2 crore in new business in FY25, 108% of quota, average deal ₹15 lakh over a four-month cycle.'",
      },
      {
        heading: "Common mistakes",
        text: "Duties instead of results. Rounding numbers up (interviewers check). A long objective paragraph. Listing every tool you have touched. One generic resume for every job: move the proof each job asks for to the top.",
      },
    ],
    faq: [
      ["What should a sales resume include?", "Contact details, a short summary, experience with results in numbers (target, attainment, pipeline, deal size), and the tools you use. Put the numbers first in each bullet."],
      ["How do I write an SDR resume with no experience?", "Lead with anything that shows you can hit a target or talk to strangers: college or part-time targets, customer-facing jobs, cold outreach you have done. Add a short line on why sales."],
      ["Should a sales resume have an objective?", "A two-line summary works better: the role you want and your strongest result. Skip long objective paragraphs."],
      ["How long should a sales resume be?", "One page for most people; two if you have more than about eight years of experience. Hiring managers skim, so the top half matters most."],
      ["Should I tailor my resume for each sales job?", "Yes. Keep the facts the same, but move the experience each job asks for to the top. JobPipe does this for each role without inventing anything."],
    ],
    jobs: { titles: ["SDR", "Account Executive", "Sales Development Representative", "BDR"], exclude: /\bkey account\b|executive\s*-\s*account management|\btalent account\b/i, regions: ["india", "blr", "remote"], india: true },
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
    title: "GTM, RevOps and AI GTM jobs in India",
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
