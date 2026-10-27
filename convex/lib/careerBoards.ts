// Companies whose own careers boards we read every morning. Most fast-growing startups post
// only there (Ashby, Greenhouse or Lever), never on the job boards, so searches would miss them.
// Picked for B2B, SaaS and AI companies hiring in India or remote. The weekly finder
// (careersFinder.ts) adds more on its own. Each board was checked by hand:
// the slug is the name in the board's address, e.g. jobs.ashbyhq.com/elevenlabs. A Workday slug is
// host/tenant/site from the careers address, e.g. adobe.wd5.myworkdayjobs.com/external_experienced.

export type CareerBoard = { name: string; website: string; ats: "ashby" | "greenhouse" | "lever" | "workday" | "keka" | "zoho" | "freshteam"; slug: string };

export const CAREER_BOARDS: CareerBoard[] = [
  // Voice and AI apps
  { name: "Wispr Flow", website: "wisprflow.ai", ats: "ashby", slug: "wispr-flow" },
  { name: "ElevenLabs", website: "elevenlabs.io", ats: "ashby", slug: "elevenlabs" },
  { name: "Emergent", website: "emergent.sh", ats: "greenhouse", slug: "emergentlabsinc" },
  { name: "Sarvam AI", website: "sarvam.ai", ats: "ashby", slug: "sarvam" },
  { name: "Smallest.ai", website: "smallest.ai", ats: "ashby", slug: "smallest" },
  { name: "Deepgram", website: "deepgram.com", ats: "ashby", slug: "deepgram" },
  { name: "Cartesia", website: "cartesia.ai", ats: "ashby", slug: "cartesia" },
  { name: "Speechify", website: "speechify.com", ats: "greenhouse", slug: "speechify" },
  { name: "Observe.AI", website: "observe.ai", ats: "greenhouse", slug: "observeai" },
  { name: "Lovable", website: "lovable.dev", ats: "ashby", slug: "lovable" },
  { name: "Cursor", website: "cursor.com", ats: "ashby", slug: "cursor" },
  { name: "Composio", website: "composio.dev", ats: "ashby", slug: "composio" },
  { name: "Writer", website: "writer.com", ats: "ashby", slug: "writer" },
  { name: "Harvey", website: "harvey.ai", ats: "ashby", slug: "harvey" },
  { name: "Glean", website: "glean.com", ats: "greenhouse", slug: "gleanwork" },
  // From a16z's top 100 consumer AI apps: the ones with India or worldwide-remote roles
  { name: "Quillbot", website: "quillbot.com", ats: "greenhouse", slug: "learneo" },
  { name: "Higgsfield", website: "higgsfield.ai", ats: "ashby", slug: "higgsfieldai" },
  // AI labs and infrastructure
  { name: "OpenAI", website: "openai.com", ats: "ashby", slug: "openai" },
  { name: "Anthropic", website: "anthropic.com", ats: "greenhouse", slug: "anthropic" },
  { name: "Scale AI", website: "scale.com", ats: "greenhouse", slug: "scaleai" },
  { name: "Together AI", website: "together.ai", ats: "greenhouse", slug: "togetherai" },
  { name: "TrueFoundry", website: "truefoundry.com", ats: "greenhouse", slug: "truefoundry" },
  { name: "Databricks", website: "databricks.com", ats: "greenhouse", slug: "databricks" },
  { name: "Snowflake", website: "snowflake.com", ats: "ashby", slug: "snowflake" },
  { name: "Atlan", website: "atlan.com", ats: "ashby", slug: "atlan" },
  // Software and developer tools
  { name: "Notion", website: "notion.com", ats: "ashby", slug: "notion" },
  { name: "Figma", website: "figma.com", ats: "greenhouse", slug: "figma" },
  { name: "GitLab", website: "gitlab.com", ats: "greenhouse", slug: "gitlab" },
  { name: "MongoDB", website: "mongodb.com", ats: "greenhouse", slug: "mongodb" },
  { name: "Elastic", website: "elastic.co", ats: "greenhouse", slug: "elastic" },
  { name: "Datadog", website: "datadoghq.com", ats: "greenhouse", slug: "datadog" },
  { name: "Twilio", website: "twilio.com", ats: "greenhouse", slug: "twilio" },
  { name: "Okta", website: "okta.com", ats: "greenhouse", slug: "okta" },
  { name: "Zscaler", website: "zscaler.com", ats: "greenhouse", slug: "zscaler" },
  { name: "Rubrik", website: "rubrik.com", ats: "greenhouse", slug: "rubrik" },
  { name: "Druva", website: "druva.com", ats: "greenhouse", slug: "druva" },
  { name: "Samsara", website: "samsara.com", ats: "greenhouse", slug: "samsara" },
  { name: "HighRadius", website: "highradius.com", ats: "greenhouse", slug: "highradius" },
  { name: "HackerRank", website: "hackerrank.com", ats: "greenhouse", slug: "hackerrank" },
  { name: "Mindtickle", website: "mindtickle.com", ats: "lever", slug: "mindtickle" },
  { name: "Grafana Labs", website: "grafana.com", ats: "greenhouse", slug: "grafanalabs" },
  { name: "Cloudflare", website: "cloudflare.com", ats: "greenhouse", slug: "cloudflare" },
  { name: "Salesloft", website: "salesloft.com", ats: "greenhouse", slug: "salesloft" },
  { name: "Outreach", website: "outreach.io", ats: "lever", slug: "outreach" },
  { name: "PostHog", website: "posthog.com", ats: "ashby", slug: "posthog" },
  { name: "Supabase", website: "supabase.com", ats: "ashby", slug: "supabase" },
  { name: "n8n", website: "n8n.io", ats: "ashby", slug: "n8n" },
  { name: "Zapier", website: "zapier.com", ats: "ashby", slug: "zapier" },
  // Fintech
  { name: "Stripe", website: "stripe.com", ats: "greenhouse", slug: "stripe" },
  { name: "Zeta", website: "zeta.tech", ats: "lever", slug: "zeta" },
  // Indian companies on Keka (slug is the part before .keka.com)
  { name: "Keka", website: "keka.com", ats: "keka", slug: "hr" },
  { name: "GoKwik", website: "gokwik.co", ats: "keka", slug: "gokwik" },
  { name: "BiteSpeed", website: "bitespeed.co", ats: "keka", slug: "bitespeed" },
  { name: "Zluri", website: "zluri.com", ats: "keka", slug: "zluri" },
  { name: "Zuddl", website: "zuddl.com", ats: "keka", slug: "zuddl" },
  { name: "Signzy", website: "signzy.com", ats: "keka", slug: "signzy" },
  // Indian B2B companies on Zoho Recruit (slug is the whole host) and Freshteam
  { name: "Pazcare", website: "pazcare.com", ats: "zoho", slug: "pazcare.zohorecruit.in" },
  { name: "Nova Benefits", website: "novabenefits.com", ats: "zoho", slug: "novabenefits.zohorecruit.in" },
  { name: "Yubi", website: "go-yubi.com", ats: "zoho", slug: "go-yubi.zohorecruit.in" },
  { name: "Increff", website: "increff.com", ats: "zoho", slug: "increff.zohorecruit.com" },
  { name: "Shipthis", website: "shipthis.co", ats: "freshteam", slug: "shipthis" },
  { name: "Locus", website: "locus.sh", ats: "freshteam", slug: "locus" },
  // Big software companies on Workday
  { name: "Adobe", website: "adobe.com", ats: "workday", slug: "adobe.wd5/adobe/external_experienced" },
  { name: "Zendesk", website: "zendesk.com", ats: "workday", slug: "zendesk.wd1/zendesk/zendesk" },
  { name: "Salesforce", website: "salesforce.com", ats: "workday", slug: "salesforce.wd12/salesforce/External_Career_Site" },
  { name: "Workday", website: "workday.com", ats: "workday", slug: "workday.wd5/workday/Workday" },
  { name: "CrowdStrike", website: "crowdstrike.com", ats: "workday", slug: "crowdstrike.wd5/crowdstrike/crowdstrikecareers" },
  { name: "Sprinklr", website: "sprinklr.com", ats: "workday", slug: "sprinklr.wd1/sprinklr/careers" },
  { name: "Autodesk", website: "autodesk.com", ats: "workday", slug: "autodesk.wd1/autodesk/Ext" },
  { name: "Cisco", website: "cisco.com", ats: "workday", slug: "cisco.wd5/cisco/Cisco_Careers" },
  { name: "HPE", website: "hpe.com", ats: "workday", slug: "hpe.wd5/hpe/Jobsathpe" },
  { name: "NVIDIA", website: "nvidia.com", ats: "workday", slug: "nvidia.wd5/nvidia/NVIDIAExternalCareerSite" },
  { name: "Zoom", website: "zoom.com", ats: "workday", slug: "zoom.wd5/zoom/Zoom" },
  { name: "PayPal", website: "paypal.com", ats: "workday", slug: "paypal.wd1/paypal/jobs" },
  { name: "Mastercard", website: "mastercard.com", ats: "workday", slug: "mastercard.wd1/mastercard/CorporateCareers" },
  { name: "Visa", website: "visa.com", ats: "workday", slug: "visa.wd5/visa/Visa" },
  { name: "PTC", website: "ptc.com", ats: "workday", slug: "ptc.wd1/ptc/PTC" },
  { name: "Thomson Reuters", website: "thomsonreuters.com", ats: "workday", slug: "thomsonreuters.wd5/thomsonreuters/External_Career_Site" },
  { name: "Broadcom", website: "broadcom.com", ats: "workday", slug: "broadcom.wd1/broadcom/External_Career" },
];
