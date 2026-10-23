import "server-only";
import { spawn } from "node:child_process";
import os from "node:os";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const MODEL = process.env.JOBHUNT_MODEL ?? "claude-opus-5-5";

/**
 * Ask Claude for JSON matching `schema`.
 *
 * Two ways in, chosen automatically:
 * - ANTHROPIC_API_KEY set: the Claude API, pay per use.
 * - Otherwise: your Claude subscription, through the `claude` command (Claude Code) running headless.
 */
export async function askJSON<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
}): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const raw = process.env.ANTHROPIC_API_KEY
    ? await viaApi(opts.system, opts.prompt, jsonSchema)
    : await viaClaudeCode(opts.system, opts.prompt, jsonSchema);
  return opts.schema.parse(raw);
}

export function aiMode() {
  return process.env.ANTHROPIC_API_KEY ? "Claude API key" : "Claude subscription";
}

async function viaApi(system: string, prompt: string, schema: Record<string, unknown>) {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined this request. Try rewording the job text.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude's answer was cut off. Try again.");
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text);
}

function viaClaudeCode(system: string, prompt: string, schema: Record<string, unknown>) {
  const args = [
    "-p",
    "--output-format", "json",
    "--model", MODEL,
    // No tools, no project settings, no MCP servers: a plain question and answer.
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
    "--system-prompt", system,
    "--json-schema", JSON.stringify(schema),
  ];
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ process.env.CLAUDE_BIN ?? "claude", args, { cwd: os.tmpdir() });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude took longer than 5 minutes. Try again."));
    }, 5 * 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't start Claude Code (${e.message}). Install it, or set ANTHROPIC_API_KEY in .env.local.`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(out);
        if (result.is_error || !result.structured_output) {
          return reject(new Error(`Claude Code returned an error: ${String(result.result ?? err).slice(0, 300)}`));
        }
        resolve(result.structured_output);
      } catch {
        reject(new Error(`Claude Code exited with code ${code}: ${(err || out).slice(0, 300)}`));
      }
    });
    child.stdin.end(prompt);
  });
}
