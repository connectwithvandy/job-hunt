"use node";

import Anthropic from "@anthropic-ai/sdk";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { env } from "../_generated/server";

/** Ask Claude for JSON matching `schema`. With `webSearch`, Claude may search the web that many times first. */
export async function askJSON<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T; webSearch?: number }): Promise<z.infer<T>> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConvexError("The AI isn't set up yet: the app owner needs to add an Anthropic API key.");
  }
  const schema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete schema.$schema;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  let response: Anthropic.Beta.BetaMessage;
  // A long web search can pause mid-turn; send the paused turn back and the server resumes it.
  for (let turn = 0; ; turn++) {
    response = await client.beta.messages.create({
      model: env.JOBHUNT_MODEL ?? "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      ...(opts.webSearch ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: opts.webSearch }] } : {}),
      messages,
    });
    if (response.stop_reason !== "pause_turn" || turn >= 3) break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (response.stop_reason === "refusal") throw new ConvexError("Claude declined this request. Try rewording the job text.");
  if (response.stop_reason === "max_tokens") throw new ConvexError("Claude's answer was cut off. Try again.");
  if (response.stop_reason === "pause_turn") throw new ConvexError("The web search took too long. Try again.");
  // With web search, the answer is the text after the last search result.
  const lastTool = response.content.findLastIndex((b) => b.type !== "text");
  const text = response.content
    .slice(lastTool + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
  return opts.schema.parse(JSON.parse(text));
}
