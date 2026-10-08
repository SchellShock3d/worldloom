import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { AIProvider, AIRequest } from "./provider";

const DEFAULT_MODEL = "claude-sonnet-5-5";
const DEFAULT_FAST_MODEL = "claude-haiku-4-5-20251001";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly live = true;
  readonly model: string;
  private readonly fastModel: string;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
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
    const msg = await this.client.messages.create(this.params(req));
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  async *stream(req: AIRequest): AsyncIterable<string> {
    const stream = this.client.messages.stream(this.params(req));
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
  }

  async structured<T>(req: AIRequest & { schema: z.ZodType<T>; name: string }): Promise<T> {
    const msg = await this.client.messages.parse({
      ...this.params({ ...req, maxTokens: req.maxTokens ?? 8192 }),
      output_config: { format: zodOutputFormat(req.schema as z.ZodType) },
    });
    if (msg.parsed_output === null || msg.parsed_output === undefined) {
      throw new Error(msg.stop_reason === "max_tokens" ? "The AI response was cut off. Try a smaller request." : "The AI returned an unexpected response.");
    }
    return msg.parsed_output as T;
  }
}
