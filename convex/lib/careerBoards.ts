// Companies whose own careers boards we read every morning. Most fast-growing startups post
// only there (Ashby, Greenhouse or Lever), never on the job boards, so searches would miss them.
// Picked for AI and SaaS companies hiring in India or remote. Each board was checked by hand:
// the slug is the name in the board's address, e.g. jobs.ashbyhq.com/elevenlabs.

export type CareerBoard = { name: string; website: string; ats: "ashby" | "greenhouse" | "lever"; slug: string };

export const CAREER_BOARDS: CareerBoard[] = [
  // Voice and AI apps
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
  // Fintech and consumer
  { name: "Stripe", website: "stripe.com", ats: "greenhouse", slug: "stripe" },
  { name: "Coinbase", website: "coinbase.com", ats: "greenhouse", slug: "coinbase" },
  { name: "Airbnb", website: "airbnb.com", ats: "greenhouse", slug: "airbnb" },
  { name: "Groww", website: "groww.in", ats: "greenhouse", slug: "groww" },
  { name: "Zeta", website: "zeta.tech", ats: "lever", slug: "zeta" },
  { name: "CRED", website: "cred.club", ats: "lever", slug: "cred" },
  { name: "Paytm", website: "paytm.com", ats: "lever", slug: "paytm" },
  { name: "Meesho", website: "meesho.com", ats: "lever", slug: "meesho" },
  { name: "Pocket FM", website: "pocketfm.com", ats: "lever", slug: "pocketfm" },
];
