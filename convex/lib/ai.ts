"use node";

import Anthropic from "@anthropic-ai/sdk";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { env } from "../_generated/server";

/**
 * Which model a task gets, cheapest that does it well. "cheap" (Haiku) copies and tidies text and can't search the web;
 * "standard" (Sonnet) judges and writes; "best" (Opus) is kept for the tailored CV and cover letter.
 */
export type Tier = "cheap" | "standard" | "best";

function modelFor(tier: Tier) {
  if (tier === "cheap") return { model: "claude-haiku-5-5", effort: "low" as const, fallback: false };
  if (tier === "standard") return { model: "claude-sonnet-5-5", effort: "medium" as const, fallback: true };
  return { model: env.JOBHUNT_MODEL ?? "claude-opus-5-5", effort: "medium" as const, fallback: true };
}

/**
 * Ask Claude for JSON matching `schema`. With `webSearch`, Claude may search the web that many times first.
 * `shared` is text that repeats across calls (like the CV); it goes first and is cached, so repeats cost a tenth.
 */
export async function askJSON<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T; webSearch?: number; tier?: Tier; shared?: string }): Promise<z.infer<T>> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ConvexError("The AI isn't set up yet: the app owner needs to add an Anthropic API key.");
  }
  const schema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete schema.$schema;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  // Haiku can't search the web, so a search always runs on Sonnet or better.
  const { model, effort, fallback } = modelFor(opts.webSearch && opts.tier === "cheap" ? "standard" : (opts.tier ?? "standard"));
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: opts.shared
        ? [{ type: "text", text: opts.shared, cache_control: { type: "ephemeral" } }, { type: "text", text: opts.prompt }]
        : opts.prompt,
    },
  ];
  let response: Anthropic.Beta.BetaMessage;
  // A long web search can pause mid-turn; send the paused turn back and the server resumes it.
  for (let turn = 0; ; turn++) {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // Haiku has no fallback model to hand a declined request to.
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      // System text is the same on every call of a kind, so cache it too.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      output_config: { effort, format: { type: "json_schema", schema } },
      ...(opts.webSearch ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: opts.webSearch }] } : {}),
      messages,
    });
    if (response.stop_reason !== "pause_turn" || turn >= 3) break;
    messages.push({ role: "assistant", content: response.content });
  }
  // One line per call in the Convex logs, to see what each task costs.
  const u = response.usage;
  console.log(`AI ${model}: ${u.input_tokens} in, ${u.cache_read_input_tokens ?? 0} cached, ${u.cache_creation_input_tokens ?? 0} stored, ${u.output_tokens} out`);
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

/**
 * A chat reply, streamed: `onText` gets the full text so far as Claude writes. Claude may search the web.
 * Returns the finished text.
 */
export async function streamChat(opts: {
  system: string;
  messages: { role: "user" | "assistant"; text: string }[];
  onText: (soFar: string) => void;
  /** App actions Claude may take; `runTool` does one and returns a short result for Claude and the reader. */
  tools?: Anthropic.Beta.BetaTool[];
  runTool?: (name: string, input: Record<string, unknown>) => Promise<string>;
}): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new ConvexError("The AI isn't set up yet: the app owner needs to add an Anthropic API key.");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.text }));
  let text = "";
  for (let turn = 0; turn < 10; turn++) {
    const stream = client.beta.messages.stream({
      // Sonnet chats well at half Opus's price.
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // The system prompt (CV, roles, jobs) is the same across a conversation, so cache it.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      // Cache the conversation too: each tool turn and each new message resends everything before it.
      cache_control: { type: "ephemeral" },
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }, ...(opts.tools ?? [])],
      messages,
    });
    let lastIndex = -1;
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "text") {
        // Separate the text before and after a web search with a paragraph break.
        if (text && lastIndex !== event.index) text += "\n\n";
        lastIndex = event.index;
      }
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        opts.onText(text);
      }
    }
    const final = await stream.finalMessage();
    const u = final.usage;
    console.log(`AI chat: ${u.input_tokens} in, ${u.cache_read_input_tokens ?? 0} cached, ${u.cache_creation_input_tokens ?? 0} stored, ${u.output_tokens} out`);
    if (final.stop_reason === "refusal") return text || "I can't help with that one. Try asking it another way.";
    if (final.stop_reason === "tool_use" && opts.runTool) {
      const calls = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        let content: string;
        let isError = false;
        try {
          content = await opts.runTool(call.name, call.input as Record<string, unknown>);
        } catch (err) {
          content = err instanceof ConvexError ? String(err.data) : "That didn't work.";
          isError = true;
        }
        // Show each action in the reply, so the reader sees what changed in the app.
        text += `${text ? "\n\n" : ""}${isError ? "✗" : "✓"} ${content}`;
        opts.onText(text);
        results.push({ type: "tool_result", tool_use_id: call.id, content, is_error: isError });
      }
      messages.push({ role: "assistant", content: final.content }, { role: "user", content: results });
      continue;
    }
    if (final.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: final.content });
  }
  return text.trim();
}
