/**
 * Shared runner for every state-changing AI task:
 *   build context → live model (structured change set) or offline engine →
 *   validate & convert → store as a proposal batch for DM review.
 */
import type { DB } from "@/server/db/client";
import type { ProposalSource } from "@/server/db/schema";
import { getAIProvider, type AIProvider } from "../provider";
import { changeSetSchema, changeSetToDrafts, type ChangeSet } from "../changeset";
import { COPILOT_IDENTITY, CHANGESET_RULES, TIME_RULES } from "../prompts";
import { createBatch } from "@/server/services/proposals";
import type { ProposalDraft } from "@/lib/proposals";
import type { CalendarDefinition } from "@/lib/calendar";

export interface ChangeSetTaskInput {
  db: DB;
  worldId: string;
  campaignId: string | null;
  userId: string;
  source: ProposalSource;
  title: string;
  /** Instructions specific to this task. */
  instructions: string;
  /** Pre-built context text (world, campaign, relevant records). */
  context: string;
  /** Deterministic fallback when no model is available (or the model fails). */
  offline: () => Promise<ChangeSet>;
  now: number;
  calendar: CalendarDefinition;
  sessionId?: string | null;
  fromAt?: number | null;
  toAt?: number | null;
  /** Proposals to put first (e.g. the clock advance). */
  leadingDrafts?: ProposalDraft[];
  maxTokens?: number;
}

export interface ChangeSetTaskResult {
  batchId: string;
  accepted: number;
  dropped: string[];
  summary: string;
  provider: AIProvider["name"];
  fellBack: boolean;
}

export async function runChangeSetTask(t: ChangeSetTaskInput): Promise<ChangeSetTaskResult> {
  const provider = await getAIProvider();
  let cs: ChangeSet;
  let fellBack = false;
  let usedProvider: AIProvider["name"] = provider.name;
  if (provider.live) {
    try {
      cs = await provider.structured({
        name: "change_set",
        schema: changeSetSchema,
        system: `${COPILOT_IDENTITY}\n\n${TIME_RULES}\n\n${CHANGESET_RULES}`,
        messages: [{ role: "user", content: `${t.context}\n\n---\n\n# Task\n${t.instructions}` }],
        maxTokens: t.maxTokens ?? 12000,
      });
    } catch (err) {
      console.error("[ai] live task failed, falling back to offline engine:", err);
      cs = await t.offline();
      cs.summary = `Claude couldn't be used (${err instanceof Error ? err.message.replace(/\.$/, "") : "error"}), so the built-in engine drafted these instead. ${cs.summary}`;
      fellBack = true;
      usedProvider = "offline";
    }
  } else {
    cs = await t.offline();
  }
  const { drafts, dropped } = await changeSetToDrafts(t.db, cs, {
    worldId: t.worldId,
    campaignId: t.campaignId,
    sessionId: t.sessionId,
    now: t.now,
    calendar: t.calendar,
  });
  const all = [...(t.leadingDrafts ?? []), ...drafts];
  const { batch, accepted, rejected } = await createBatch(
    t.db,
    {
      worldId: t.worldId,
      campaignId: t.campaignId,
      source: t.source,
      title: t.title,
      summary: cs.summary,
      provider: usedProvider,
      fromAt: t.fromAt,
      toAt: t.toAt,
      sessionId: t.sessionId,
      createdBy: t.userId,
    },
    all,
  );
  return { batchId: batch.id, accepted, dropped: [...dropped, ...rejected.map((r) => `${r.kind}: ${r.error}`)], summary: cs.summary, provider: usedProvider, fellBack };
}
