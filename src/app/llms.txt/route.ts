import { LEGAL } from "@/lib/legal";
import { DEFINITION, FAQ, STEPS } from "@/lib/marketing";

// A plain-text summary for AI tools (the llms.txt convention), built from the same words as the landing page.
export const dynamic = "force-static";

export function GET() {
  const body = `# ${LEGAL.product}

> ${DEFINITION}

## How it works
${STEPS.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## FAQ
${FAQ.map(([q, a]) => `### ${q}\n${a}`).join("\n\n")}

## Pages
- [Home](${LEGAL.site}/)
- [Pricing](${LEGAL.site}/pricing)
- [Privacy policy](${LEGAL.site}/privacy)
- [Terms](${LEGAL.site}/terms)
- [Contact](${LEGAL.site}/contact): ${LEGAL.email}
- [Source code](https://github.com/connectwithvandy/job-hunt)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
