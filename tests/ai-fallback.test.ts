/**
 * When Claude is configured but failing (no credits, bad key, outage), every
 * AI feature keeps working from the records and says why.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/server/db/client";
import { createDemoWorld } from "@/server/services/seed";
import { advanceWorld } from "@/server/ai/tasks/world-tasks";
import { assistantTurn } from "@/server/ai/tasks/assistant";
import { __setProvider, describeAIError, noteAIFailure, providerInfo, type AIProvider } from "@/server/ai/provider";
import { durationToMinutes, DEFAULT_CALENDAR } from "@/lib/calendar";
import { setupTestDb, createTestUser } from "./helpers";

let handle: Awaited<ReturnType<typeof setupTestDb>>;
let db: DB;
beforeAll(async () => {
  handle = await setupTestDb();
  db = handle.db;
});
afterEach(() => __setProvider(null));
afterAll(async () => handle.close());

// Shaped like the Anthropic SDK's APIError for an account without credits.
const billingError = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), {
  status: 400,
  error: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } },
});

const brokenClaude: AIProvider = {
  name: "anthropic",
  live: true,
  model: "claude-test",
  async text() {
    throw new Error(describeAIError(billingError));
  },
  // eslint-disable-next-line require-yield
  async *stream() {
    throw new Error(describeAIError(billingError));
  },
  async structured() {
    throw new Error(describeAIError(billingError));
  },
};

describe("AI failures", () => {
  it("explains common API errors in plain words", () => {
    expect(describeAIError(billingError)).toMatch(/no API credits/);
    expect(describeAIError(Object.assign(new Error("401"), { status: 401 }))).toMatch(/key was rejected/);
    expect(describeAIError(Object.assign(new Error("overloaded"), { status: 529 }))).toMatch(/overloaded/);
  });

  it("answers from the records, with the reason, when Claude can't answer", async () => {
    __setProvider(brokenClaude);
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const events = [];
    for await (const e of assistantTurn(db, { worldId, campaignId, userId: user.id, message: "Who is Lord Vael?" })) events.push(e);
    expect(events.some((e) => e.type === "error")).toBe(false);
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toMatch(/Claude couldn't answer: Your Anthropic account has no API credits/);
    expect(text).toMatch(/Vael/);
  });

  it("drafts Advance World proposals with the built-in engine and says so", async () => {
    __setProvider(brokenClaude);
    const user = await createTestUser(db);
    const { worldId, campaignId } = await createDemoWorld(db, user.id);
    const res = await advanceWorld({ db, worldId, campaignId, userId: user.id, minutes: durationToMinutes(DEFAULT_CALENDAR, 3, "days") });
    expect(res.fellBack).toBe(true);
    expect(res.accepted).toBeGreaterThan(0);
    expect(res.summary).toMatch(/no API credits/);
  });

  it("reports a recent failure so the UI can show it", () => {
    noteAIFailure("Your Anthropic account has no API credits.");
    expect(providerInfo(brokenClaude).problem).toMatch(/no API credits/);
  });
});
