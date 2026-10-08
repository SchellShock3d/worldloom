import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { describeAIError, noteAIFailure, noteAISuccess, type AIProvider, type AIRequest } from "./provider";
import { fillDefaults } from "./schema-utils";

/** Record the outcome and rethrow failures with a message a DM can act on. */
function fail(err: unknown): never {
  const message = describeAIError(err);
  noteAIFailure(message);
  throw new Error(message, { cause: err });
}

const DEFAULT_MODEL = "claude-sonnet-5-5";
const DEFAULT_FAST_MODEL = "claude-haiku-4-5-20251001";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly live = true;
  readonly model: string;
  private readonly fastModel: string;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 300_000 });
    this.model = process.env.AI_MODEL || DEFAULT_MODEL;
    this.fastModel = process.env.AI_FAST_MODEL || DEFAULT_FAST_MODEL;
  }

  private params(req: AIRequest) {
    return {
      model: req.fast ? this.fastModel : this.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  async text(req: AIRequest): Promise<string> {
    const msg = await this.client.messages.create(this.params(req)).catch(fail);
    noteAISuccess();
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  async *stream(req: AIRequest): AsyncIterable<string> {
    try {
      const stream = this.client.messages.stream(this.params(req));
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
    } catch (err) {
      fail(err);
    }
    noteAISuccess();
  }

  async structured<T>(req: AIRequest & { schema: z.ZodType<T>; name: string; strict?: boolean }): Promise<T> {
    if (req.strict === false) return this.viaTool(req);
    const msg = await this.client.messages
      .parse({
        ...this.params({ ...req, maxTokens: req.maxTokens ?? 8192 }),
        output_config: { format: zodOutputFormat(req.schema as z.ZodType) },
      })
      .catch(fail);
    noteAISuccess();
    if (msg.parsed_output === null || msg.parsed_output === undefined) {
      throw new Error(msg.stop_reason === "max_tokens" ? "The AI response was cut off. Try a smaller request." : "The AI returned an unexpected response.");
    }
    return msg.parsed_output as T;
  }

  /** Large schemas: a forced tool call, validated with zod, with one chance to repair the shape. */
  private async viaTool<T>(req: AIRequest & { schema: z.ZodType<T>; name: string }): Promise<T> {
    const inputSchema = z.toJSONSchema(req.schema, { io: "input" }) as Record<string, unknown>;
    delete inputSchema.$schema;
    const tool: Anthropic.Tool = { name: req.name, description: "Return your complete result by calling this tool once.", input_schema: inputSchema as Anthropic.Tool.InputSchema };
    const base = this.params({ ...req, maxTokens: req.maxTokens ?? 8192 });
    // Forcing a specific tool isn't available on every model, so ask for it and check.
    const system = `${base.system}\n\nDeliver your result by calling the ${req.name} tool exactly once with the complete result. Do not answer in plain text.`;
    let messages: Anthropic.MessageParam[] = base.messages;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Streamed so long outputs (a whole world's foundation) aren't capped by request timeouts.
      const msg = await this.client.messages
        .stream({ ...base, system, messages, tools: [tool], tool_choice: { type: "auto", disable_parallel_tool_use: true } })
        .finalMessage()
        .catch(fail);
      if (msg.stop_reason === "max_tokens") fail(new Error("The AI response was cut off. Try a smaller request."));
      const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!block) {
        messages = [...messages, { role: "assistant", content: msg.content }, { role: "user", content: `Call the ${req.name} tool now with the complete result.` }];
        continue;
      }
      debugDump(req.name, { attempt, stop: msg.stop_reason, usage: msg.usage, input: block.input });
      const parsed = req.schema.safeParse(fillDefaults(req.schema, block.input));
      if (parsed.success) {
        noteAISuccess();
        return parsed.data;
      }
      console.warn(`[ai] ${req.name}: output didn't match the schema (attempt ${attempt + 1}); asking for a correction.`);
      messages = [
        ...messages,
        { role: "assistant", content: msg.content },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: block.id, is_error: true, content: `That didn't match the schema:\n${z.prettifyError(parsed.error).slice(0, 4000)}\nCall ${req.name} again with the complete, corrected result.` }],
        },
      ];
    }
    fail(new Error("The AI returned results in the wrong shape twice."));
  }
}

/** Set AI_DEBUG_DIR to keep raw model outputs for prompt tuning. */
function debugDump(name: string, data: unknown) {
  const dir = process.env.AI_DEBUG_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/${Date.now()}-${name}.json`, JSON.stringify(data, null, 2));
}
