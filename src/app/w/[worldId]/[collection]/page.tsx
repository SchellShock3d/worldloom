import { notFound } from "next/navigation";
import { requireWorld } from "@/server/auth/access";
import { getDb } from "@/server/db/client";
import { getActiveCampaign } from "@/server/context";
import { CollectionView, type CollectionSpec } from "@/components/entity/collection-page";
import { PLACE_TYPES } from "@/lib/entity-types";

const SPECS: Record<string, Omit<CollectionSpec, "path">> = {
  characters: { title: "Characters", description: "NPCs and player characters: who they are, where they are, and what they want.", types: ["npc", "pc"] },
  locations: { title: "Places", description: "Continents to taverns. Places nest inside each other, so a tavern sits in a city, in a region.", types: PLACE_TYPES },
  factions: { title: "Factions & faiths", description: "The powers of the world: factions, organizations, religions and gods.", types: ["faction", "organization", "religion", "deity"] },
  items: { title: "Items", description: "Mundane treasures, quest items, and magic items with their histories.", types: ["item", "magic_item"] },
  bestiary: { title: "Bestiary", description: "Your own creatures and their stat blocks. No external monster database needed.", types: ["creature"] },
  culture: { title: "Cultures & languages", description: "Peoples, customs and tongues. Culture name lists feed the name generator.", types: ["culture", "language"] },
  rumours: { title: "Rumours", description: "What people are saying, and how close it is to the truth.", types: ["rumour"] },
};

export async function generateMetadata({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  return { title: SPECS[collection]?.title ?? "Not found" };
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ worldId: string; collection: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { worldId, collection } = await params;
  const spec = SPECS[collection];
  if (!spec) notFound();
  await requireWorld(worldId);
  const db = await getDb();
  const { campaign } = await getActiveCampaign(worldId);
  return <CollectionView db={db} worldId={worldId} campaignId={campaign?.id ?? null} spec={{ ...spec, path: `/w/${worldId}/${collection}` }} searchParams={await searchParams} />;
}
