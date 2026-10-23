"use node";

import Anthropic from "@anthropic-ai/sdk";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { env } from "../_generated/server";

/** Ask Claude for JSON matching `schema`. */
export async function askJSON<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T }): Promise<z.infer<T>> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConvexError("The AI isn't set up yet: the app owner needs to add an Anthropic API key.");
  }
  const schema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete schema.$schema;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    model: env.JOBHUNT_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: opts.prompt }],
  });
  if (response.stop_reason === "refusal") throw new ConvexError("Claude declined this request. Try rewording the job text.");
  if (response.stop_reason === "max_tokens") throw new ConvexError("Claude's answer was cut off. Try again.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return opts.schema.parse(JSON.parse(text));
}
