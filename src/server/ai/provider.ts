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
  /**
   * Output validated against the schema. `strict` (default) uses constrained decoding, which caps
   * schema size; `strict: false` asks for a single tool call, then validates it and retries with
   * the errors (up to three attempts), for large schemas such as the change set.
   */
  structured<T>(req: AIRequest & { schema: z.ZodType<T>; name: string; strict?: boolean }): Promise<T>;
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

/** Turn a vendor/network error into something a DM can act on. */
export function describeAIError(err: unknown): string {
  const e = err as { status?: number; message?: string; name?: string; error?: { error?: { type?: string; message?: string } } };
  const raw = `${e?.error?.error?.message ?? ""} ${e?.message ?? ""}`;
  const type = e?.error?.error?.type ?? "";
  if (/credit balance is too low/i.test(raw)) return "Your Anthropic account has no API credits. Add credits under Plans & Billing at console.anthropic.com.";
  if (e?.status === 401 || type === "authentication_error") return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (e?.status === 403 || type === "permission_error") return "This API key isn't allowed to use the configured model.";
  if (e?.status === 404 || type === "not_found_error") return "The configured model isn't available to this API key. Check AI_MODEL.";
  if (e?.status === 429 || type === "rate_limit_error") return "Anthropic's rate limit was reached. Try again in a minute.";
  if (e?.status === 529 || type === "overloaded_error") return "Claude is overloaded right now. Try again shortly.";
  if (e?.name === "APIConnectionError" || e?.name === "APIConnectionTimeoutError") return "The server couldn't reach the Anthropic API.";
  const msg = (e?.error?.error?.message ?? e?.message ?? "").replace(/\s+/g, " ").trim();
  return msg ? msg.slice(0, 200) : "The AI model failed.";
}

// The most recent live-AI failure, so the UI can explain why answers are coming from the offline engine.
let lastFailure: { message: string; at: number } | null = null;
export function noteAIFailure(message: string) {
  lastFailure = { message, at: Date.now() };
}
export function noteAISuccess() {
  lastFailure = null;
}

export function providerInfo(p: AIProvider) {
  const problem = p.live && lastFailure && Date.now() - lastFailure.at < 15 * 60_000 ? lastFailure.message : null;
  return { name: p.name, live: p.live, model: p.model, problem };
}

/** For tests. */
export function __setProvider(p: AIProvider | null) {
  cached = p;
}
