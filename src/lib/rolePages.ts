// Pages for the searches sales people actually type ("SDR jobs India", "account executive jobs Bengaluru").
// Each is a real guide to the role plus how JobPipe helps; no made-up salaries or job counts.

export type RolePage = {
  slug: string;
  title: string; // the H1 and the search title
  description: string; // 140-160 characters, for Google
  intro: string;
  looksFor: string[];
  faq: [string, string][];
};

export const ROLE_PAGES: RolePage[] = [
  {
    slug: "sdr-bdr-jobs-india",
    title: "SDR and BDR jobs in India",
    description: "Find SDR and BDR jobs in India and remote APAC. JobPipe scores every opening against your CV, tailors your CV and shows who can refer you.",
    intro:
      "Sales Development Representative (SDR) and Business Development Representative (BDR) roles are the most common way into B2B sales. Most openings are at SaaS companies in Bengaluru, Gurugram, Mumbai and Pune, plus remote roles selling into the US, EMEA and APAC.",
    looksFor: [
      "Meetings booked and pipeline created, with numbers and percentage of target.",
      "Outbound activity that worked: channels, sequences and reply rates.",
      "Tools: Salesforce or HubSpot, Outreach or Salesloft, LinkedIn Sales Navigator.",
      "Which market you sold into (US, EMEA, APAC) and to whom (SMB, mid-market, enterprise).",
    ],
    faq: [
      ["What is the difference between an SDR and a BDR?", "An SDR usually follows up on inbound leads and a BDR usually prospects outbound, but many companies use the two titles for the same job. Read the job description, not the title, to see which one it is."],
      ["Do SDR jobs in India sell to the US?", "Many do. A large share of SDR and BDR roles in Bengaluru and remote India sell into North America or EMEA, often on shifted hours. The job description usually says which region and time zone."],
      ["How does JobPipe help with SDR jobs?", "JobPipe searches job boards and company careers pages every morning, scores each SDR or BDR opening against your CV with a reason, tailors your CV without inventing anything, and shows who you know at the company."],
    ],
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
    ],
  },
  {
    slug: "account-executive-jobs-bengaluru",
    title: "Account Executive jobs in Bengaluru and India",
    description: "Account Executive jobs in Bengaluru, India and remote APAC: SMB, mid-market and enterprise. JobPipe scores each one against your CV and finds warm intros.",
    intro:
      "Account Executives (AEs) own deals from first meeting to signed contract. Bengaluru has the biggest share of SaaS AE roles in India, from SMB and mid-market to enterprise, with more remote roles covering APAC and the Middle East.",
    looksFor: [
      "Quota and attainment over several quarters or years, as numbers.",
      "Deal size, sales cycle length and the segment you sold to.",
      "New logos versus expansion, and the industries you sold into.",
      "Forecast accuracy and the CRM you ran your pipeline in.",
    ],
    faq: [
      ["What is a full-cycle Account Executive?", "A full-cycle AE finds their own pipeline as well as closing it, instead of relying only on meetings booked by SDRs. Many startup AE roles in India are full cycle."],
      ["How do I show I'm ready for an enterprise AE role?", "Show deal sizes, cycle length, multi-threading and quota attainment in numbers. JobPipe's tailored CV puts the proof a job asks for first, using only facts from your own CV."],
      ["Does JobPipe apply to AE jobs for me?", "No. JobPipe finds and scores jobs, tailors your CV and drafts referral notes, but you apply yourself. Recruiters are wary of bot applications, so this keeps your applications credible."],
    ],
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
    ],
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
    ],
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
    ],
  },
];
