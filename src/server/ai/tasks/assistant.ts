/**
 * The DM copilot conversation. Questions are answered from retrieved records;
 * requests to create things become proposal batches; roleplay conversations
 * are limited to the character's knowledge boundary.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { aiConversations, aiMessages } from "@/server/db/schema";
import { getAIProvider } from "../provider";
import { buildDmContext, buildNpcContext } from "../context";
import { COPILOT_IDENTITY } from "../prompts";
import { offlineAnswer } from "../offline/answer";
import { generateContent } from "./world-tasks";
import { forgottenThreads, unfinishedBusiness } from "@/server/services/insights";
import { detectType } from "../offline/generate";

export type AssistantEvent =
  | { type: "meta"; conversationId: string; refs: { id: string; name: string; type: string }[]; provider: string }
  | { type: "text"; delta: string }
  | { type: "proposals"; batchId: string; summary: string; count: number }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

const GENERATE_RE = /^\s*(please\s+)?(create|make|generate|add|invent|give me|come up with|design|build|write up|roll up|draft|populate)\b/i;

export function isGenerationRequest(text: string) {
  return GENERATE_RE.test(text) && (detectType(text) !== null || /\b(some|a|an|\d+)\b/i.test(text));
}

export async function* assistantTurn(
  db: DB,
  opts: { worldId: string; campaignId: string | null; userId: string; conversationId?: string | null; message: string; focusEntityId?: string | null; roleplayEntityId?: string | null },
): AsyncGenerator<AssistantEvent> {
  const provider = await getAIProvider();
  let convId = opts.conversationId ?? null;
  if (convId) {
    const [c] = await db.select().from(aiConversations).where(eq(aiConversations.id, convId));
    if (!c || c.worldId !== opts.worldId || c.userId !== opts.userId) convId = null;
  }
  if (!convId) {
    const [c] = await db
      .insert(aiConversations)
      .values({ worldId: opts.worldId, campaignId: opts.campaignId, userId: opts.userId, title: opts.message.slice(0, 80), roleplayEntityId: opts.roleplayEntityId ?? null })
      .returning();
    convId = c!.id;
  }
  const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, convId));
  const history = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, convId)).orderBy(desc(aiMessages.createdAt)).limit(12);
  await db.insert(aiMessages).values({ conversationId: convId, role: "user", content: opts.message });
  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, convId));

  // 1) Creation requests become proposals.
  if (!conv?.roleplayEntityId && isGenerationRequest(opts.message)) {
    yield { type: "meta", conversationId: convId, refs: [], provider: provider.name };
    try {
      const res = await generateContent({ db, worldId: opts.worldId, campaignId: opts.campaignId, userId: opts.userId, request: opts.message, focusIds: opts.focusEntityId ? [opts.focusEntityId] : [] });
      const text = `${res.summary}\n\nI've prepared **${res.accepted} proposal${res.accepted === 1 ? "" : "s"}** for you to review. Nothing is added to your world until you approve it.`;
      yield { type: "text", delta: text };
      yield { type: "proposals", batchId: res.batchId, summary: res.summary, count: res.accepted };
      const [m] = await db.insert(aiMessages).values({ conversationId: convId, role: "assistant", content: text, proposalBatchId: res.batchId }).returning();
      yield { type: "done", messageId: m!.id };
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : "Generation failed" };
    }
    return;
  }

  // 2) Roleplay a character within their knowledge boundary.
  if (conv?.roleplayEntityId) {
    const npcCtx = await buildNpcContext(db, opts.worldId, conv.roleplayEntityId, opts.campaignId);
    yield { type: "meta", conversationId: convId, refs: [{ id: npcCtx.npc.id, name: npcCtx.npc.name, type: npcCtx.npc.type }], provider: provider.name };
    let full = "";
    if (provider.live) {
      try {
        const system = `${npcCtx.text}\n\nStay in character as ${npcCtx.npc.name}. Speak in first person with their voice and mannerisms. Only use knowledge listed above; if asked about something they wouldn't know, react as they would (guess, deflect, lie if in character, or admit ignorance). Never reveal information outside their knowledge. Keep replies conversational and short unless asked for more. The DM may step out of character by writing in [brackets]; answer those briefly out of character.`;
        const msgs = [...history.reverse().map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: opts.message }];
        for await (const delta of provider.stream({ system, messages: msgs, maxTokens: 1200 })) {
          full += delta;
          yield { type: "text", delta };
        }
      } catch (err) {
        yield { type: "error", message: err instanceof Error ? err.message : "The AI model failed" };
        return;
      }
    } else {
      const f = npcCtx.npc.fields as Record<string, string>;
      full = `_(Offline roleplay notes for ${npcCtx.npc.name})_\n\n**Voice:** ${f.voice || f.mannerisms || "not recorded"}\n**Personality:** ${f.personality || "not recorded"}\n**Wants:** ${f.motivations || f.goals || "not recorded"}\n\n**What they know:**\n${npcCtx.text.split("# What")[1]?.split("\n").slice(1, 10).join("\n") || "- Nothing recorded yet. Add knowledge on their page."}\n\nAdd an Anthropic API key to have the AI speak as this character.`;
      yield { type: "text", delta: full };
    }
    const [m] = await db.insert(aiMessages).values({ conversationId: convId, role: "assistant", content: full, contextRefs: [{ id: npcCtx.npc.id, name: npcCtx.npc.name, type: npcCtx.npc.type }] }).returning();
    yield { type: "done", messageId: m!.id };
    return;
  }

  // 3) Grounded answer.
  const ctx = await buildDmContext(db, { worldId: opts.worldId, campaignId: opts.campaignId, query: opts.message, focusIds: opts.focusEntityId ? [opts.focusEntityId] : [], budgetChars: 32000 });
  yield { type: "meta", conversationId: convId, refs: ctx.refs, provider: provider.name };
  let full = "";
  if (provider.live) {
    let extra = "";
    const ql = opts.message.toLowerCase();
    if (opts.campaignId && /(forgot|forgotten|lost track|resurface|dropped)/.test(ql)) {
      const items = await forgottenThreads(db, opts.worldId, opts.campaignId, ctx.bundle.calendar);
      extra += `\n\n# Forgotten thread detector output\n${items.map((i) => `- ${i.title}. ${i.detail}`).join("\n") || "(nothing flagged)"}`;
    }
    if (opts.campaignId && /(unfinished business|owe|grudge|promised)/.test(ql)) {
      const ub = await unfinishedBusiness(db, opts.worldId, opts.campaignId);
      extra += `\n\n# Unfinished business\n${ub.map((u) => `- ${u.name} {id:${u.id}}: ${u.reasons.join("; ")}`).join("\n") || "(none recorded)"}`;
    }
    const system = `${COPILOT_IDENTITY}

Answer the DM's question using the world records below. Cite entities by writing their exact names. If the records don't cover something, say so and offer a suggestion clearly labelled as a suggestion. When the DM asks you to create or change things, briefly describe what you'd propose and tell them they can ask "create …" to get reviewable proposals.
When you mention an existing entity, you may link it using the syntax @[Name](entity:<uuid>) with the uuid from its {id:...} tag.

${ctx.text}${extra}`;
    const msgs = [...history.reverse().map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: opts.message }];
    try {
      for await (const delta of provider.stream({ system, messages: msgs, maxTokens: 2500 })) {
        full += delta;
        yield { type: "text", delta };
      }
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : "The AI model failed" };
      return;
    }
  } else {
    const relevant = await import("../context").then((m) => m.retrieveEntities(db, opts.worldId, { query: opts.message, focusIds: opts.focusEntityId ? [opts.focusEntityId] : [], campaignId: opts.campaignId, maxEntities: 6 }));
    full = await offlineAnswer(db, opts.message, ctx.bundle, relevant);
    // Stream in small chunks so the UI behaves the same.
    for (const chunk of full.match(/[\s\S]{1,60}/g) ?? []) yield { type: "text", delta: chunk };
  }
  const [m] = await db.insert(aiMessages).values({ conversationId: convId, role: "assistant", content: full, contextRefs: ctx.refs }).returning();
  yield { type: "done", messageId: m!.id };
}

export async function listConversations(db: DB, worldId: string, userId: string) {
  return db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.worldId, worldId))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(40)
    .then((rows) => rows.filter((r) => r.userId === userId));
}

export async function getConversation(db: DB, worldId: string, userId: string, id: string) {
  const [c] = await db.select().from(aiConversations).where(eq(aiConversations.id, id));
  if (!c || c.worldId !== worldId || c.userId !== userId) return null;
  const msgs = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.createdAt));
  return { conversation: c, messages: msgs };
}

