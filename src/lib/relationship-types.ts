/**
 * Relationship vocabulary. `relationships.type` is free text so DMs can invent
 * their own; these known keys get proper forward/inverse labels.
 *
 * "Located in" is intentionally NOT a relationship type: where something is
 * lives in `entities.location_id` (one source of truth), and the UI/graph show
 * it as a derived edge.
 */
export interface RelationshipTypeDef {
  key: string;
  label: string; // source → target
  inverse: string; // target → source
  symmetric?: boolean;
  /** Short hint for which kinds of entities this usually connects. */
  hint?: string;
  category: "social" | "family" | "political" | "ownership" | "story" | "knowledge" | "other";
}

export const RELATIONSHIP_TYPES: RelationshipTypeDef[] = [
  { key: "member_of", label: "member of", inverse: "has member", category: "political", hint: "NPC → faction" },
  { key: "leads", label: "leads", inverse: "led by", category: "political", hint: "NPC → faction" },
  { key: "rules", label: "rules", inverse: "ruled by", category: "political", hint: "NPC → nation/settlement" },
  { key: "controls", label: "controls", inverse: "controlled by", category: "political", hint: "faction → region" },
  { key: "allied_with", label: "allied with", inverse: "allied with", symmetric: true, category: "political" },
  { key: "enemy_of", label: "enemy of", inverse: "enemy of", symmetric: true, category: "political" },
  { key: "at_war_with", label: "at war with", inverse: "at war with", symmetric: true, category: "political", hint: "nation ↔ nation" },
  { key: "rival_of", label: "rival of", inverse: "rival of", symmetric: true, category: "social" },
  { key: "serves", label: "serves", inverse: "served by", category: "political" },
  { key: "employs", label: "employs", inverse: "employed by", category: "political" },
  { key: "works_at", label: "works at", inverse: "staffed by", category: "political", hint: "NPC → shop/tavern" },
  { key: "parent_of", label: "parent of", inverse: "child of", category: "family" },
  { key: "sibling_of", label: "sibling of", inverse: "sibling of", symmetric: true, category: "family" },
  { key: "spouse_of", label: "spouse of", inverse: "spouse of", symmetric: true, category: "family" },
  { key: "friend_of", label: "friend of", inverse: "friend of", symmetric: true, category: "social" },
  { key: "loves", label: "loves", inverse: "loved by", category: "social" },
  { key: "hates", label: "hates", inverse: "hated by", category: "social" },
  { key: "fears", label: "fears", inverse: "feared by", category: "social" },
  { key: "owes", label: "owes", inverse: "owed by", category: "social" },
  { key: "mentor_of", label: "mentor of", inverse: "student of", category: "social" },
  { key: "owns", label: "owns", inverse: "owned by", category: "ownership", hint: "NPC → shop/item" },
  { key: "possesses", label: "carries", inverse: "carried by", category: "ownership", hint: "character → item" },
  { key: "guards", label: "guards", inverse: "guarded by", category: "ownership" },
  { key: "seeks", label: "seeks", inverse: "sought by", category: "story", hint: "faction → item" },
  { key: "created", label: "created", inverse: "created by", category: "ownership" },
  { key: "founded", label: "founded", inverse: "founded by", category: "political" },
  { key: "worships", label: "worships", inverse: "worshipped by", category: "political", hint: "NPC/culture → deity" },
  { key: "worshipped_by", label: "worshipped by", inverse: "worships", category: "political", hint: "deity → religion" },
  { key: "speaks", label: "speaks", inverse: "spoken by", category: "knowledge", hint: "culture → language" },
  { key: "belongs_to", label: "belongs to", inverse: "includes", category: "other", hint: "NPC → culture" },
  { key: "inhabits", label: "inhabits", inverse: "inhabited by", category: "other", hint: "creature → region" },
  { key: "involves", label: "involves", inverse: "involved in", category: "story", hint: "quest/event/thread → anything" },
  { key: "drives", label: "drives", inverse: "driven by", category: "story", hint: "faction → world thread" },
  { key: "threatens", label: "threatens", inverse: "threatened by", category: "story" },
  { key: "depends_on", label: "depends on", inverse: "prerequisite for", category: "story", hint: "thread/quest → thread/quest" },
  { key: "caused", label: "caused", inverse: "caused by", category: "story", hint: "event → event" },
  { key: "spreads", label: "spreads", inverse: "spread by", category: "knowledge", hint: "faction → rumour" },
  { key: "circulates_in", label: "circulates in", inverse: "rumoured here", category: "knowledge", hint: "rumour → location" },
  { key: "knows_about", label: "knows about", inverse: "known to", category: "knowledge" },
  { key: "related_to", label: "related to", inverse: "related to", symmetric: true, category: "other" },
];

export const RELATIONSHIP_TYPE_MAP: Record<string, RelationshipTypeDef> = Object.fromEntries(
  RELATIONSHIP_TYPES.map((t) => [t.key, t]),
);

export function relationshipLabel(type: string, direction: "forward" | "inverse"): string {
  const def = RELATIONSHIP_TYPE_MAP[type];
  if (!def) {
    const words = type.replace(/_/g, " ");
    return direction === "forward" ? words : `${words} (inverse)`;
  }
  return direction === "forward" ? def.label : def.inverse;
}

export function normalizeRelationshipType(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}
