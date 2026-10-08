/**
 * AI provider abstraction. Components and services never call a vendor SDK
 * directly; they go through tasks, which use this interface. Adding another
 * provider means implementing AIProvider and registering it in getAIProvider().
 */
import type { z } from "zod";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Use the faster/cheaper model (quick generators). */
  fast?: boolean;
}

export interface AIProvider {
  readonly name: "anthropic" | "offline";
  /** false = no model available; tasks fall back to the deterministic engine. */
  readonly live: boolean;
  readonly model: string;
  text(req: AIRequest): Promise<string>;
  stream(req: AIRequest): AsyncIterable<string>;
  /** Structured output validated against the given schema. */
  structured<T>(req: AIRequest & { schema: z.ZodType<T>; name: string }): Promise<T>;
}

export class AIUnavailableError extends Error {
  constructor() {
    super("No AI model is configured. Add ANTHROPIC_API_KEY to enable live AI.");
  }
}

class OfflineProvider implements AIProvider {
  readonly name = "offline" as const;
  readonly live = false;
  readonly model = "worldloom-rules";
  async text(): Promise<string> {
    throw new AIUnavailableError();
  }
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<string> {
    throw new AIUnavailableError();
  }
  async structured<T>(): Promise<T> {
    throw new AIUnavailableError();
  }
}

let cached: AIProvider | null = null;

export async function getAIProvider(): Promise<AIProvider> {
  if (cached) return cached;
  const choice = (process.env.AI_PROVIDER ?? "").toLowerCase();
  const key = process.env.ANTHROPIC_API_KEY;
  if (choice === "offline" || process.env.WORLDLOOM_TEST === "1" || !key) {
    cached = new OfflineProvider();
  } else {
    const { AnthropicProvider } = await import("./anthropic");
    cached = new AnthropicProvider(key);
  }
  return cached;
}

export function providerInfo(p: AIProvider) {
  return { name: p.name, live: p.live, model: p.model };
}

/** For tests. */
export function __setProvider(p: AIProvider | null) {
  cached = p;
}
